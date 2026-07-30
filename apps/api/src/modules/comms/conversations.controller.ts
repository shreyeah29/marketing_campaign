import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { z } from 'zod'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { buildPage, cursorPaginationSchema, decodeCursor, type Paginated } from '@vsp/contracts'
import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { RequiresFeature } from '../../common/guards/entitlement.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { CrudService } from '../../common/crud/crud.service.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Conversations — the unified inbox across channels.
 *
 * Listing and lookup stay on the generic CRUD service so tenant-scoping and
 * cursor pagination are inherited, not re-implemented. The message endpoints
 * below are the live-chat surface: OUTBOUND is the composer, INBOUND is how a
 * channel integration records a received message. Both go through
 * `withTenantTransaction`, and no route ever reads `organizationId` from the
 * request — the tenant comes from the authenticated session.
 */
@ApiTags('Conversations')
@RequiresFeature('comms.live_chat')
@Controller('conversations')
export class ConversationsController {
  private readonly crud: CrudService
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {
    this.crud = new CrudService(this.db)
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'List conversations, newest first' })
  async list(@Query() query: unknown): Promise<Paginated<unknown>> {
    const { cursor, limit } = cursorPaginationSchema.parse(query)
    return this.crud.list('conversation', { cursor, limit })
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Create a conversation' })
  async create(
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ConversationResponse> {
    const parsed = createConversationSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          // organizationId is injected by the tenant extension; setting a foreign
          // one would be refused as a mismatch.
          organizationId: principal.organizationId,
          channel: input.channel,
          subject: input.subject ?? null,
          contactId: input.contactId ?? null,
          isOpen: true,
          unreadCount: 0,
        },
      })
      return toConversation(conversation)
    })
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Retrieve one conversation' })
  async findOne(@Param('id') id: string): Promise<unknown> {
    return this.crud.get('conversation', id)
  }

  @Get(':id/messages')
  @RequirePermissions(PERMISSIONS.CRM_READ)
  @ApiOperation({ summary: 'Paginated message history for a conversation, newest first' })
  async messages(
    @Param('id') id: string,
    @Query() rawQuery: unknown,
  ): Promise<Paginated<MessageResponse>> {
    const { cursor, limit } = cursorPaginationSchema.parse(rawQuery)
    const position = cursor === undefined ? null : decodeCursor(cursor)

    return withTenantTransaction(this.db, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!conversation) throw new NotFoundException(`No conversation with id ${id}`)

      const rows = await tx.message.findMany({
        where: {
          conversationId: id,
          // Seek predicate over the (createdAt, id) sort so a concurrent insert
          // cannot make the client skip or duplicate a row at a page boundary.
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
        take: limit + 1,
      })

      return buildPage(rows.map(toMessage), limit, (row) => row.createdAt)
    })
  }

  @Post(':id/messages')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Send an outbound message or record an inbound one' })
  async sendMessage(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<MessageResponse> {
    const parsed = sendMessageSchema.safeParse(rawBody)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues)
    const input = parsed.data

    return withTenantTransaction(this.db, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!conversation) throw new NotFoundException(`No conversation with id ${id}`)

      const now = new Date()
      const outbound = input.direction === 'OUTBOUND'

      const message = await tx.message.create({
        data: {
          organizationId: principal.organizationId,
          conversationId: id,
          direction: input.direction,
          body: input.body,
          status: outbound ? 'SENT' : 'DELIVERED',
          sentAt: outbound ? now : null,
        },
      })

      await tx.conversation.update({
        where: { id },
        data: {
          lastMessageAt: now,
          lastMessagePreview: input.body.slice(0, 140),
          ...(outbound ? {} : { unreadCount: { increment: 1 } }),
        },
      })

      return toMessage(message)
    })
  }

  @Post(':id/read')
  @RequirePermissions(PERMISSIONS.CRM_WRITE)
  @ApiOperation({ summary: 'Mark a conversation read' })
  async markRead(@Param('id') id: string): Promise<{ ok: true }> {
    return withTenantTransaction(this.db, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      })
      if (!conversation) throw new NotFoundException(`No conversation with id ${id}`)

      const now = new Date()
      await tx.conversation.update({ where: { id }, data: { unreadCount: 0 } })
      await tx.message.updateMany({
        where: { conversationId: id, direction: 'INBOUND', readAt: null },
        data: { readAt: now, status: 'READ' },
      })

      return { ok: true }
    })
  }
}

// ── Contracts ──────────────────────────────────────────────────────────────────

const channelSchema = z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'VOICE', 'WEB_CHAT'])
const directionSchema = z.enum(['INBOUND', 'OUTBOUND'])

const createConversationSchema = z.object({
  subject: z.string().max(500).optional(),
  channel: channelSchema.default('WEB_CHAT'),
  contactId: z.string().optional(),
})

const sendMessageSchema = z.object({
  body: z.string().min(1).max(8000),
  direction: directionSchema.default('OUTBOUND'),
})

export interface ConversationResponse {
  id: string
  channel: string
  subject: string | null
  contactId: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  isOpen: boolean
  createdAt: string
  updatedAt: string
}

export interface MessageResponse {
  id: string
  conversationId: string
  direction: string
  status: string
  body: string | null
  mediaUrls: string[]
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  createdAt: string
}

interface ConversationRow {
  id: string
  channel: string
  subject: string | null
  contactId: string | null
  lastMessageAt: Date | null
  lastMessagePreview: string | null
  unreadCount: number
  isOpen: boolean
  createdAt: Date
  updatedAt: Date
}

interface MessageRow {
  id: string
  conversationId: string
  direction: string
  status: string
  body: string | null
  mediaUrls: string[]
  sentAt: Date | null
  deliveredAt: Date | null
  readAt: Date | null
  createdAt: Date
}

/**
 * Explicit wire mappers rather than spreading the entity: a response built by
 * spreading leaks every column added by a later migration, silently.
 */
function toConversation(row: ConversationRow): ConversationResponse {
  return {
    id: row.id,
    channel: row.channel,
    subject: row.subject,
    contactId: row.contactId,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: row.lastMessagePreview,
    unreadCount: row.unreadCount,
    isOpen: row.isOpen,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toMessage(row: MessageRow): MessageResponse {
  return {
    id: row.id,
    conversationId: row.conversationId,
    direction: row.direction,
    status: row.status,
    body: row.body,
    mediaUrls: row.mediaUrls,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
