import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Lead capture forms — the authenticated management surface.
 *
 * Every handler is tenant-scoped through `withTenantTransaction`, which binds the
 * organisation from the request's AsyncLocalStorage context; `organizationId` is
 * never read from the wire. The public, unauthenticated submission path lives in
 * `PublicFormsController` and uses the RLS-exempt system client instead.
 */
const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
})

const createFormSchema = z.object({
  name: z.string().min(1),
  headline: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(fieldSchema).optional(),
  submitLabel: z.string().optional(),
  successMessage: z.string().optional(),
  redirectUrl: z.string().optional(),
  accentColor: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pipelineId: z.string().optional(),
})

const updateFormSchema = z.object({
  name: z.string().min(1).optional(),
  headline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  fields: z.array(fieldSchema).optional(),
  submitLabel: z.string().nullable().optional(),
  successMessage: z.string().nullable().optional(),
  redirectUrl: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  pipelineId: z.string().nullable().optional(),
})

/** Lowercase, hyphenate, strip anything that is not a URL-safe word character. */
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base.length > 0 ? base : 'form'
}

@ApiTags('Marketing')
@RequiresFeature('marketing.forms')
@Controller('lead-forms')
export class LeadFormsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List lead forms, newest first' })
  async list(): Promise<unknown> {
    return withTenantTransaction(this.db, (tx) =>
      tx.leadForm.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    )
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Create a lead form' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<unknown> {
    const parsed = createFormSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const base = slugify(input.name)
      // Unique per (organizationId, slug). On collision append a short random-ish
      // suffix so a second "Contact us" form still gets a distinct public URL.
      const clash = await tx.leadForm.findFirst({ where: { slug: base }, select: { id: true } })
      const slug = clash ? `${base}-${Math.random().toString(36).slice(2, 7)}` : base

      const form = await tx.leadForm.create({
        data: {
          organizationId: principal.organizationId,
          name: input.name,
          slug,
          status: 'DRAFT',
          fields: (input.fields ?? []) as never,
          headline: input.headline ?? null,
          description: input.description ?? null,
          submitLabel: input.submitLabel ?? null,
          successMessage: input.successMessage ?? null,
          redirectUrl: input.redirectUrl ?? null,
          accentColor: input.accentColor ?? null,
          tags: input.tags ?? [],
          pipelineId: input.pipelineId ?? null,
          ownerId: principal.type === 'user' ? principal.id : null,
        },
      })
      return form
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Retrieve one lead form' })
  async findOne(@Param('id') id: string): Promise<unknown> {
    const form = await withTenantTransaction(this.db, (tx) =>
      tx.leadForm.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!form) throw new NotFoundException(`No lead form with id ${id}`)
    return form
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Update a lead form' })
  async update(@Param('id') id: string, @Body() rawBody: unknown): Promise<unknown> {
    const parsed = updateFormSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.leadForm.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No lead form with id ${id}`)

      return tx.leadForm.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.headline === undefined ? {} : { headline: input.headline }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.fields === undefined ? {} : { fields: input.fields as never }),
          ...(input.submitLabel === undefined ? {} : { submitLabel: input.submitLabel }),
          ...(input.successMessage === undefined ? {} : { successMessage: input.successMessage }),
          ...(input.redirectUrl === undefined ? {} : { redirectUrl: input.redirectUrl }),
          ...(input.accentColor === undefined ? {} : { accentColor: input.accentColor }),
          ...(input.tags === undefined ? {} : { tags: input.tags }),
          ...(input.pipelineId === undefined ? {} : { pipelineId: input.pipelineId }),
        },
      })
    })
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  @ApiOperation({ summary: 'Publish a lead form' })
  async publish(@Param('id') id: string): Promise<unknown> {
    return this.setStatus(id, 'PUBLISHED')
  }

  @Post(':id/unpublish')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  @ApiOperation({ summary: 'Return a lead form to draft' })
  async unpublish(@Param('id') id: string): Promise<unknown> {
    return this.setStatus(id, 'DRAFT')
  }

  private async setStatus(id: string, status: 'PUBLISHED' | 'DRAFT') {
    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.leadForm.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No lead form with id ${id}`)
      return tx.leadForm.update({ where: { id }, data: { status } })
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CONTENT_WRITE)
  @ApiOperation({ summary: 'Soft-delete a lead form' })
  async remove(@Param('id') id: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.leadForm.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No lead form with id ${id}`)
      await tx.leadForm.update({ where: { id }, data: { deletedAt: new Date() } })
      return { ok: true }
    })
  }

  @Get(':id/submissions')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'List submissions for a form, newest first' })
  async submissions(@Param('id') id: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const form = await tx.leadForm.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!form) throw new NotFoundException(`No lead form with id ${id}`)
      return tx.formSubmission.findMany({
        where: { formId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, data: true, createdAt: true, leadId: true },
      })
    })
  }

  @Get(':id/stats')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  @ApiOperation({ summary: 'Submission stats for a form' })
  async stats(@Param('id') id: string): Promise<unknown> {
    return withTenantTransaction(this.db, async (tx) => {
      const form = await tx.leadForm.findFirst({
        where: { id, deletedAt: null },
        select: { submitCount: true },
      })
      if (!form) throw new NotFoundException(`No lead form with id ${id}`)
      const since = new Date(Date.now() - 7 * 864e5)
      const last7Days = await tx.formSubmission.count({
        where: { formId: id, createdAt: { gte: since } },
      })
      return {
        submitCount: form.submitCount,
        last7Days,
        conversionNote:
          form.submitCount === 0
            ? 'No submissions yet — publish and share the form link to start capturing leads.'
            : `${last7Days} of ${form.submitCount} submissions arrived in the last 7 days.`,
      }
    })
  }
}
