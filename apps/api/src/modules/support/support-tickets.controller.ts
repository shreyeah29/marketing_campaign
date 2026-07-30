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
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { DATABASE } from '../../infrastructure/database.module.js'

// ── Enums, mirrored from the Prisma schema (TicketStatus / Priority) ────────────
const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

type TicketStatus = (typeof TICKET_STATUSES)[number]
type Priority = (typeof PRIORITIES)[number]

// ── Wire response shapes (explicit, so no Prisma types leak into the surface) ────
interface TicketListItem {
  id: string
  subject: string
  status: TicketStatus
  priority: Priority
  assigneeId: string | null
  requesterEmail: string | null
  createdAt: string
  commentCount: number
}

interface TicketCommentResponse {
  id: string
  ticketId: string
  authorId: string | null
  body: string
  internal: boolean
  createdAt: string
}

interface TicketDetail {
  id: string
  subject: string
  body: string
  status: TicketStatus
  priority: Priority
  requesterId: string | null
  requesterEmail: string | null
  assigneeId: string | null
  contactId: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  comments: TicketCommentResponse[]
}

interface TicketStatsSummary {
  open: number
  pending: number
  resolved: number
  closed: number
  total: number
}

// ── Request contracts ───────────────────────────────────────────────────────────
const listTicketsSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
})

const createTicketSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  requesterEmail: z.string().email().optional(),
  contactId: z.string().optional(),
})

const updateTicketSchema = z
  .object({
    subject: z.string().min(1).max(300).optional(),
    body: z.string().min(1).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: z.string().nullable().optional(),
    status: z.enum(TICKET_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })

const createCommentSchema = z.object({
  body: z.string().min(1),
  internal: z.boolean().optional(),
})

/**
 * Support Ticketing — internal agent-facing queue.
 *
 * Follows the contacts vertical slice: no `organizationId` ever crosses the wire,
 * the tenant comes from the session, and every DB access runs inside
 * `withTenantTransaction` so the Prisma extension scopes it.
 */
@ApiTags('Support')
@RequiresFeature('support.ticketing')
@Controller('support/tickets')
export class SupportTicketsController {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List tickets, newest first' })
  async list(@Query() rawQuery: unknown): Promise<TicketListItem[]> {
    const query = listTicketsSchema.safeParse(rawQuery)
    if (!query.success) throw new BadRequestException(query.error.issues)

    const rows = await withTenantTransaction(this.db, (tx) =>
      tx.supportTicket.findMany({
        where: {
          deletedAt: null,
          ...(query.data.status === undefined ? {} : { status: query.data.status }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          assigneeId: true,
          requesterEmail: true,
          createdAt: true,
          _count: { select: { comments: true } },
        },
      }),
    )

    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assigneeId,
      requesterEmail: row.requesterEmail,
      createdAt: row.createdAt.toISOString(),
      commentCount: row._count.comments,
    }))
  }

  @Get('stats/summary')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Ticket counts by status' })
  async summary(): Promise<TicketStatsSummary> {
    const grouped = await withTenantTransaction(this.db, (tx) =>
      tx.supportTicket.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    )

    const counts = { open: 0, pending: 0, resolved: 0, closed: 0, total: 0 }
    for (const g of grouped) {
      const n = g._count._all
      counts.total += n
      if (g.status === 'OPEN') counts.open = n
      else if (g.status === 'PENDING') counts.pending = n
      else if (g.status === 'RESOLVED') counts.resolved = n
      else if (g.status === 'CLOSED') counts.closed = n
    }
    return counts
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one ticket with its comments' })
  async findOne(@Param('id') id: string): Promise<TicketDetail> {
    const ticket = await withTenantTransaction(this.db, (tx) =>
      tx.supportTicket.findFirst({
        where: { id, deletedAt: null },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      }),
    )
    if (!ticket) throw new NotFoundException(`No ticket with id ${id}`)
    return toDetail(ticket)
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a ticket' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TicketDetail> {
    const parsed = createTicketSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          organizationId: principal.organizationId,
          subject: input.subject,
          body: input.body,
          priority: input.priority,
          requesterId: principal.type === 'user' ? principal.id : null,
          requesterEmail: input.requesterEmail ?? null,
          contactId: input.contactId ?? null,
        },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      })
      return toDetail(ticket)
    })
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Update a ticket' })
  async update(@Param('id') id: string, @Body() rawBody: unknown): Promise<TicketDetail> {
    const parsed = updateTicketSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const before = await tx.supportTicket.findFirst({ where: { id, deletedAt: null } })
      if (!before) throw new NotFoundException(`No ticket with id ${id}`)

      // Resolution timestamp is derived from the status transition, never sent by
      // the client: entering RESOLVED/CLOSED stamps it, reopening to OPEN clears it.
      let resolvedAt: Date | null | undefined
      if (input.status === 'RESOLVED' || input.status === 'CLOSED') resolvedAt = new Date()
      else if (input.status === 'OPEN') resolvedAt = null

      const ticket = await tx.supportTicket.update({
        where: { id },
        data: {
          ...(input.subject === undefined ? {} : { subject: input.subject }),
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(resolvedAt === undefined ? {} : { resolvedAt }),
        },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      })
      return toDetail(ticket)
    })
  }

  @Post(':id/comments')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Add a comment to a ticket' })
  async addComment(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<TicketCommentResponse> {
    const parsed = createCommentSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const ticket = await tx.supportTicket.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!ticket) throw new NotFoundException(`No ticket with id ${id}`)

      const comment = await tx.supportTicketComment.create({
        data: {
          organizationId: principal.organizationId,
          ticketId: ticket.id,
          authorId: principal.type === 'user' ? principal.id : null,
          body: input.body,
          internal: input.internal ?? false,
        },
      })
      return toComment(comment)
    })
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CRM_DELETE)
  @ApiOperation({ summary: 'Soft-delete a ticket' })
  async remove(@Param('id') id: string): Promise<{ id: string; deleted: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.supportTicket.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!existing) throw new NotFoundException(`No ticket with id ${id}`)

      await tx.supportTicket.update({ where: { id }, data: { deletedAt: new Date() } })
      return { id, deleted: true }
    })
  }
}

// ── Wire mappers ─────────────────────────────────────────────────────────────────
interface CommentRow {
  id: string
  ticketId: string
  authorId: string | null
  body: string
  internal: boolean
  createdAt: Date
}

interface TicketRow {
  id: string
  subject: string
  body: string
  status: (typeof TICKET_STATUSES)[number]
  priority: (typeof PRIORITIES)[number]
  requesterId: string | null
  requesterEmail: string | null
  assigneeId: string | null
  contactId: string | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  comments: CommentRow[]
}

function toComment(row: CommentRow): TicketCommentResponse {
  return {
    id: row.id,
    ticketId: row.ticketId,
    authorId: row.authorId,
    body: row.body,
    internal: row.internal,
    createdAt: row.createdAt.toISOString(),
  }
}

function toDetail(row: TicketRow): TicketDetail {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    status: row.status,
    priority: row.priority,
    requesterId: row.requesterId,
    requesterEmail: row.requesterEmail,
    assigneeId: row.assigneeId,
    contactId: row.contactId,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    comments: row.comments.map(toComment),
  }
}
