import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient, type PrismaClient } from '@vsp/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { DATABASE, SYSTEM_DB } from '../../infrastructure/database.module.js'
import { WorkflowEngineService } from '../automation/workflow-engine.service.js'

/**
 * The public, unauthenticated hosted-form surface.
 *
 * A form is addressed by slug by an anonymous visitor, so it must be resolved
 * BEFORE any tenant context exists. That is the one thing the tenant-scoped client
 * cannot do, so this controller uses the RLS-exempt `SYSTEM_DB` client for the
 * initial lookup only — and immediately narrows to the single organisation the
 * form belongs to, handing off to `withTenantTransaction` for every write. The
 * organisation is trusted because it is read from the form's own record, never
 * from the request.
 */
interface FormField {
  key: string
  label: string
  type: string
  required?: boolean
}

function coerceFields(value: unknown): FormField[] {
  if (!Array.isArray(value)) return []
  const out: FormField[] = []
  for (const raw of value) {
    if (raw && typeof raw === 'object') {
      const f = raw as Record<string, unknown>
      if (typeof f['key'] === 'string' && typeof f['label'] === 'string' && typeof f['type'] === 'string') {
        out.push({ key: f['key'], label: f['label'], type: f['type'], required: Boolean(f['required']) })
      }
    }
  }
  return out
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

@ApiTags('Marketing')
@Controller('public/forms')
export class PublicFormsController {
  constructor(
    @Inject(SYSTEM_DB) private readonly system: PrismaClient,
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(WorkflowEngineService) private readonly workflows: WorkflowEngineService,
  ) {}

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Fetch a published hosted form by slug' })
  async getForm(@Param('slug') slug: string): Promise<unknown> {
    const form = await this.system.leadForm.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
    })
    if (!form) throw new NotFoundException()

    // Public-safe projection only — never leak organizationId, ownerId, pipelineId.
    return {
      id: form.id,
      name: form.name,
      headline: form.headline,
      description: form.description,
      fields: form.fields,
      submitLabel: form.submitLabel,
      successMessage: form.successMessage,
      accentColor: form.accentColor,
    }
  }

  @Public()
  @Post(':slug')
  @ApiOperation({ summary: 'Submit a hosted form' })
  async submit(@Param('slug') slug: string, @Body() rawBody: unknown, @Req() req: FastifyRequest): Promise<unknown> {
    const bodySchema = z.record(z.string(), z.unknown())
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const body = parsed.data
    // Cap payload size so a public endpoint cannot be used to store arbitrary blobs.
    if (JSON.stringify(body).length > 20_000) {
      throw new BadRequestException('Submission is too large')
    }

    const form = await this.system.leadForm.findFirst({
      where: { slug, status: 'PUBLISHED', deletedAt: null },
    })
    if (!form) throw new NotFoundException()

    const organizationId = form.organizationId
    const formId = form.id
    const fields = coerceFields(form.fields)

    // Pull an email and a name out of the submitted values by inspecting the
    // form's own field definitions (by type, then by key/label).
    let email: string | null = null
    let name: string | null = null
    for (const f of fields) {
      const raw = body[f.key]
      const val = typeof raw === 'string' ? raw.trim() : undefined
      if (!val) continue
      const tag = `${f.type} ${f.key} ${f.label}`.toLowerCase()
      if (email === null && (f.type.toLowerCase() === 'email' || tag.includes('email')) && EMAIL_RE.test(val)) {
        email = val
      }
      if (name === null && tag.includes('name')) {
        name = val
      }
    }
    // Fallback: any value that looks like an email.
    if (email === null) {
      for (const v of Object.values(body)) {
        if (typeof v === 'string' && EMAIL_RE.test(v.trim())) {
          email = v.trim()
          break
        }
      }
    }

    const referrerHeader = req.headers['referer']
    const referrer =
      typeof referrerHeader === 'string'
        ? referrerHeader
        : Array.isArray(referrerHeader)
          ? (referrerHeader[0] ?? null)
          : null
    const userAgent = req.headers['user-agent'] ?? null
    const ipAddress = req.ip ?? null

    const context = { organizationId }
    const leadId = await withTenantTransaction(
      this.db,
      async (tx) => {
        let contactId: string | null = null
        if (email !== null) {
          const existing = await tx.contact.findFirst({ where: { email }, select: { id: true } })
          if (existing) {
            contactId = existing.id
          } else {
            const contact = await tx.contact.create({
              data: { organizationId, firstName: name ?? email, email },
            })
            contactId = contact.id
          }
        }

        const lead = await tx.lead.create({
          data: {
            organizationId,
            status: 'NEW',
            source: 'FORM',
            contactId,
            ownerId: form.ownerId ?? null,
          },
        })

        await tx.formSubmission.create({
          data: {
            organizationId,
            formId,
            data: body as never,
            contactId,
            leadId: lead.id,
            ipAddress,
            userAgent,
            referrer,
          },
        })

        await tx.leadForm.update({ where: { id: formId }, data: { submitCount: { increment: 1 } } })

        await tx.notification.create({
          data: {
            organizationId,
            level: 'INFO',
            title: 'New form submission',
            body: `A new lead came in from "${form.name}"`,
            actionUrl: '/app/crm/leads',
          },
        })

        return lead.id
      },
      context,
    )

    // Fire event-triggered workflows AFTER commit. A workflow failure must never
    // fail the visitor's submission, so swallow errors here.
    try {
      await this.workflows.fireEventForOrg(organizationId, 'lead.created', {
        leadId,
        formId,
        source: 'form',
      })
    } catch {
      // Intentionally ignored — the lead is already captured.
    }

    return {
      ok: true,
      successMessage: form.successMessage ?? null,
      redirectUrl: form.redirectUrl ?? null,
    }
  }
}
