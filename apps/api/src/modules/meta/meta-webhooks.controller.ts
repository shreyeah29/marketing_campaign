import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  type RawBodyRequest,
} from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'

import type { AppLogger } from '@marketing-os/observability'
import type { DatabaseClient } from '@marketing-os/database'

import { Public } from '../../common/guards/permissions.guard.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE, LOGGER } from '../../infrastructure/database.module.js'
import { parseLeadgenEvents, verifyHandshake, verifySignature } from './meta-webhook.util.js'

/**
 * The public entry point Meta calls for lead ads and WhatsApp. It does the minimum
 * that must happen synchronously and securely — verify the signature, and record
 * each event idempotently — then returns 200 immediately. Resolving which tenant
 * owns the event, fetching the lead, and creating the CRM record happen in the
 * worker (owner DB connection), because a webhook is not tenant-scoped and the
 * API's RLS-bound role cannot read across organisations.
 */
@ApiExcludeController()
@Controller('webhooks/meta')
export class MetaWebhooksController {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  /** Subscription handshake: echo the challenge when the verify token matches. */
  @Public()
  @Get()
  verify(@Query() query: Record<string, string | undefined>): string {
    const token = loadEnv().META_WEBHOOK_VERIFY_TOKEN
    if (!token) throw new ServiceUnavailableException('Webhooks are not configured')
    const challenge = verifyHandshake(query, token)
    if (challenge === null) throw new ForbiddenException('Verification failed')
    return challenge
  }

  /** Receive an event: verify signature, then record each lead idempotently. */
  @Public()
  @Post()
  async receive(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Query() _query: unknown,
  ): Promise<{ received: true }> {
    const env = loadEnv()
    if (!env.META_APP_SECRET) throw new ServiceUnavailableException('Webhooks are not configured')

    const raw = req.rawBody
    const signature = req.headers['x-hub-signature-256']
    if (
      !raw ||
      !verifySignature(
        raw,
        typeof signature === 'string' ? signature : undefined,
        env.META_APP_SECRET,
      )
    ) {
      throw new BadRequestException('Invalid signature')
    }

    const payload = req.body as { object?: string }

    // Lead ads: record one event per submission for the worker to process.
    for (const event of parseLeadgenEvents(payload)) {
      await this.record(`leadgen:${event.leadgenId}`, 'page', 'leadgen', event)
    }

    // WhatsApp inbound is recorded whole; the chatbot worker (Phase 5) consumes it.
    if (payload.object === 'whatsapp_business_account') {
      const id = messageDedupeKey(payload)
      await this.record(id, 'whatsapp_business_account', 'messages', payload)
    }

    // Always 200 quickly; Meta retries non-2xx and we've already persisted the work.
    return { received: true }
  }

  /** Idempotent insert keyed by a natural event id; a duplicate is a no-op. */
  private async record(
    externalId: string,
    object: string,
    field: string,
    payload: unknown,
  ): Promise<void> {
    try {
      await this.db.metaWebhookEvent.create({
        data: { externalId, object, field, payload: payload as never, status: 'RECEIVED' },
      })
    } catch (err) {
      // A unique-violation means we've already recorded this event — that's the
      // point of idempotency, so swallow it. Anything else is worth a log.
      if (!isUniqueViolation(err)) {
        this.logger.warn({ err, externalId }, 'failed to record Meta webhook event')
      }
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

/** A stable-ish dedupe key for a WhatsApp payload, from the first message id. */
function messageDedupeKey(payload: unknown): string {
  const entry = (
    payload as {
      entry?: { id?: string; changes?: { value?: { messages?: { id?: string }[] } }[] }[]
    }
  ).entry?.[0]
  const msgId = entry?.changes?.[0]?.value?.messages?.[0]?.id
  return msgId ? `wa:${msgId}` : `wa:${entry?.id ?? 'unknown'}:${String(Date.now())}`
}
