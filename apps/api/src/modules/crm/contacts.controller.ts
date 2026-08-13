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
  Query,
} from '@nestjs/common'
import { z } from 'zod'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  buildPage,
  cursorPaginationSchema,
  decodeCursor,
  type Paginated,
} from '@marketing-os/contracts'
import { publishEvent, withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

import {
  contactResponseSchema,
  createContactSchema,
  listContactsSchema,
  updateContactSchema,
  type ContactResponse,
  type CreateContactInput,
  type UpdateContactInput,
} from './contact.contracts.js'

/**
 * Contacts — the reference vertical slice.
 *
 * Every other resource controller follows this shape, and the shape carries the
 * platform's invariants:
 *
 *   · **No `organizationId` anywhere.** Not a parameter, not a filter, not in a
 *     body. The tenant comes from the authenticated session via the interceptor,
 *     and the Prisma extension applies it. A route that accepted an
 *     organisation id would be a route someone could pass a different one to.
 *   · **Cursor pagination only**, so a concurrent write cannot make a client skip
 *     or duplicate rows mid-scroll.
 *   · **Writes emit a domain event inside the same transaction**, through the
 *     outbox — never after the commit.
 *   · **Permissions declared on the handler**, checked by the global guard.
 */
@ApiTags('CRM')
@RequiresFeature('crm.contacts')
@Controller('contacts')
export class ContactsController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List contacts, newest first' })
  async list(@Query() rawQuery: unknown): Promise<Paginated<ContactResponse>> {
    const query = listContactsSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)

    const { cursor, limit } = cursorPaginationSchema.parse(query.data)
    const position = cursor === undefined ? null : decodeCursor(cursor)

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.contact.findMany({
        where: {
          deletedAt: null,
          ...(query.data.search === undefined
            ? {}
            : {
                OR: [
                  { firstName: { contains: query.data.search, mode: 'insensitive' } },
                  { lastName: { contains: query.data.search, mode: 'insensitive' } },
                  { email: { contains: query.data.search, mode: 'insensitive' } },
                ],
              }),
          ...(query.data.companyId === undefined ? {} : { companyId: query.data.companyId }),
          // Seek predicate. The id breaks ties so rows sharing a createdAt are
          // neither skipped nor repeated at a page boundary.
          ...(position === null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: new Date(position.value) } },
                  { createdAt: new Date(position.value), id: { lt: position.id } },
                ],
              }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // One extra row is how hasMore is determined without a second query or a
        // count — a count on a large tenant table costs a scan per page.
        take: limit + 1,
      }),
    )

    return buildPage(rows.map(toResponse), limit, (row) => row.createdAt)
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one contact' })
  async findOne(@Param('id') id: string): Promise<ContactResponse> {
    // findFirst, not findUnique: the tenant extension refuses findUnique because
    // Prisma will not accept a non-unique predicate in its where clause, which
    // would leave the lookup unscoped. findFirst takes the same predicate.
    const contact = await withTenantTransaction(this.db, (tx) =>
      tx.contact.findFirst({ where: { id, deletedAt: null } }),
    )
    if (!contact) throw new NotFoundException(`No contact with id ${id}`)
    return toResponse(contact)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a contact' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ContactResponse> {
    const parsed = createContactSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input: CreateContactInput = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      if (input.email !== undefined) {
        const existing = await tx.contact.findFirst({
          where: { email: input.email, deletedAt: null },
          select: { id: true },
        })
        if (existing) {
          throw new BadRequestException(`A contact with email ${input.email} already exists`)
        }
      }

      const contact = await tx.contact.create({
        data: {
          // organizationId is injected by the extension. Setting it here would be
          // refused as a TenantMismatchError if it disagreed with the session.
          organizationId: principal.organizationId,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          jobTitle: input.jobTitle ?? null,
          companyId: input.companyId ?? null,
          ownerId: principal.type === 'user' ? principal.id : null,
          // Consent is recorded explicitly and defaults to false. Outbound
          // messaging checks these, and a default of true would make the
          // platform the reason a customer broke the law.
          emailOptIn: input.emailOptIn ?? false,
          whatsappOptIn: input.whatsappOptIn ?? false,
          smsOptIn: input.smsOptIn ?? false,
          consentSource: input.consentSource ?? null,
          tags: input.tags ?? [],
        },
      })

      // Inside the transaction. If the commit fails, the event never existed.
      await publishEvent(
        tx,
        'crm.lead.created.v1',
        {
          leadId: contact.id,
          contactId: contact.id,
          source: input.consentSource ?? null,
          campaignId: null,
        },
        { aggregateType: 'Contact', aggregateId: contact.id },
      )

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'contact.created',
          resourceType: 'contact',
          resourceId: contact.id,
          after: { firstName: contact.firstName, email: contact.email },
        },
      })

      return toResponse(contact)
    })
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a contact' })
  async update(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ContactResponse> {
    const parsed = updateContactSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input: UpdateContactInput = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.contact.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No contact with id ${id}`)

      const contact = await tx.contact.update({
        where: { id },
        data: {
          ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
          ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
          ...(input.emailOptIn === undefined ? {} : { emailOptIn: input.emailOptIn }),
          ...(input.whatsappOptIn === undefined ? {} : { whatsappOptIn: input.whatsappOptIn }),
          ...(input.tags === undefined ? {} : { tags: input.tags }),
          // Opting out is recorded with a timestamp, not by clearing the flags.
          // Proving *when* consent was withdrawn is the point of the record.
          ...(input.optOut === true ? { optOutAt: new Date() } : {}),
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: principal.type === 'user' ? 'USER' : 'API_KEY',
          userId: principal.type === 'user' ? principal.id : null,
          action: 'contact.updated',
          resourceType: 'contact',
          resourceId: contact.id,
          before: { firstName: before.firstName, emailOptIn: before.emailOptIn },
          after: { firstName: contact.firstName, emailOptIn: contact.emailOptIn },
        },
      })

      return toResponse(contact)
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Delete a contact' })
  remove(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.crud.remove('contact', principal, id, 'contact')
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Bulk-delete contacts' })
  bulk(@Body() body: unknown, @CurrentPrincipal() principal: Principal) {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(body)
    return this.crud.bulkRemove('contact', principal, ids, 'contact')
  }
}

interface ContactRow {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  companyId: string | null
  ownerId: string | null
  emailOptIn: boolean
  whatsappOptIn: boolean
  smsOptIn: boolean
  optOutAt: Date | null
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Maps a row to the wire shape.
 *
 * Explicit rather than spreading the entity. A response built by spreading leaks
 * every column added later — including ones that should never be public — and the
 * leak arrives silently with the migration that adds them.
 */
function toResponse(row: ContactRow): ContactResponse {
  return contactResponseSchema.parse({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    jobTitle: row.jobTitle,
    companyId: row.companyId,
    ownerId: row.ownerId,
    consent: {
      email: row.emailOptIn,
      whatsapp: row.whatsappOptIn,
      sms: row.smsOptIn,
      optedOutAt: row.optOutAt?.toISOString() ?? null,
    },
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}
