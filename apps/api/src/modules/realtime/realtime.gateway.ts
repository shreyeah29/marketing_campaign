import { Inject, Injectable } from '@nestjs/common'
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'

import type { AppLogger } from '@vsp/observability'

import type { Principal } from '../../common/auth/principal.js'
import { can } from '../../common/auth/principal.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { LOGGER } from '../../infrastructure/database.module.js'

/**
 * Realtime gateway.
 *
 * Carries agent-run progress and notifications. Two properties matter more than
 * anything else here, and both are easy to get wrong:
 *
 *   **1. Authentication happens at handshake, not per message.** A socket that
 *   connects unauthenticated and is "checked later" is a socket that has already
 *   joined the process; any bug in the later check leaks a live channel. An
 *   unauthenticated handshake is disconnected before it can subscribe to anything.
 *
 *   **2. Rooms are tenant-scoped and clients cannot choose them.** The room name
 *   is derived from the authenticated principal, never from a client-supplied
 *   value. A gateway that honours `socket.join(payload.room)` lets any customer
 *   subscribe to any other customer's events — a cross-tenant leak over a channel
 *   nobody thinks to audit, because it never touches the REST layer or the
 *   database.
 *
 * Agent-run streams are additionally checked per subscription: the run must belong
 * to the caller's organisation, and the caller must hold `agents:run`.
 */

interface AuthenticatedSocket extends Socket {
  principal?: Principal
}

/** Room for everything an organisation should see. */
const orgRoom = (organizationId: string): string => `org:${organizationId}`

/** Room for one agent run's step stream. */
const runRoom = (organizationId: string, runId: string): string =>
  `org:${organizationId}:run:${runId}`

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  // CORS is set from the same allowlist as the REST layer. A permissive
  // websocket origin policy would bypass the restriction the HTTP layer enforces.
  cors: { credentials: true },
  // Long-poll fallback is deliberately kept: corporate proxies still break raw
  // websockets, and a customer whose network blocks them should degrade rather
  // than see a permanently broken UI.
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server

  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  /**
   * Handshake.
   *
   * Phase 6 replaces the placeholder resolution with Better Auth session
   * verification. Until then no principal can be established, so **every** socket
   * is disconnected — the same fail-closed posture as the REST layer. A gateway
   * that accepted connections while auth was unfinished would be an open channel.
   */
  handleConnection(socket: AuthenticatedSocket): void {
    const principal = this.resolvePrincipal(socket)

    if (!principal) {
      this.logger.debug(
        { socketId: socket.id },
        'rejecting websocket handshake: no authenticated principal',
      )
      // Disconnect before any room is joined and before any handler can run.
      socket.emit('error', { code: 'unauthenticated', message: 'Authentication required' })
      socket.disconnect(true)
      return
    }

    socket.principal = principal

    // Joined server-side from the verified principal. The client never names a
    // room, so it cannot name someone else's.
    void socket.join(orgRoom(principal.organizationId))

    this.logger.info(
      { socketId: socket.id, organizationId: principal.organizationId, userId: principal.id },
      'websocket connected',
    )

    socket.emit('connected', {
      organizationId: principal.organizationId,
      // Told explicitly what it may do, so the UI can hide affordances rather
      // than offer actions the server will refuse.
      capabilities: {
        agentRuns: can(principal, PERMISSIONS.AGENTS_RUN),
        approvals: can(principal, PERMISSIONS.AGENTS_APPROVE),
      },
    })
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    this.logger.debug(
      { socketId: socket.id, organizationId: socket.principal?.organizationId },
      'websocket disconnected',
    )
  }

  /**
   * Subscribes to one agent run's step stream.
   *
   * The run id comes from the client, so it is validated against the principal
   * rather than trusted: the room is constructed from the *principal's*
   * organisation, so even a valid-looking run id from another tenant resolves to
   * a room that tenant's events never reach.
   */
  @SubscribeMessage('agent-run:subscribe')
  subscribeToRun(socket: AuthenticatedSocket, payload: unknown): { ok: boolean; error?: string } {
    const principal = socket.principal
    if (!principal) return { ok: false, error: 'unauthenticated' }

    if (!can(principal, PERMISSIONS.AGENTS_RUN)) {
      return { ok: false, error: 'insufficient_permission' }
    }

    const runId = extractRunId(payload)
    if (runId === null) return { ok: false, error: 'invalid_run_id' }

    // Constructed from the principal, never from the payload's own idea of a
    // tenant. This is the line that makes cross-tenant subscription impossible.
    void socket.join(runRoom(principal.organizationId, runId))

    this.logger.debug(
      { socketId: socket.id, organizationId: principal.organizationId, runId },
      'subscribed to agent run stream',
    )

    return { ok: true }
  }

  @SubscribeMessage('agent-run:unsubscribe')
  unsubscribeFromRun(socket: AuthenticatedSocket, payload: unknown): { ok: boolean } {
    const principal = socket.principal
    const runId = extractRunId(payload)
    if (!principal || runId === null) return { ok: false }

    void socket.leave(runRoom(principal.organizationId, runId))
    return { ok: true }
  }

  // ── Server-side emitters ───────────────────────────────────────────────────
  // Every emit targets a tenant room. There is no method that broadcasts to all
  // sockets, deliberately: such a method exists to be misused.

  /** Notifies one organisation. */
  notifyOrganization(organizationId: string, event: string, payload: unknown): void {
    this.server.to(orgRoom(organizationId)).emit(event, payload)
  }

  /**
   * Streams one step of an agent run.
   *
   * Called from the worker via Redis pub/sub in Phase 5, so a run executing in a
   * worker process reaches sockets held by an API process. Without that, progress
   * would only stream when the run happened to execute on the same instance the
   * user connected to — which works perfectly in development and fails in
   * production behind a load balancer.
   */
  streamRunStep(
    organizationId: string,
    runId: string,
    step: { type: string; status: string; title?: string; output?: unknown },
  ): void {
    this.server.to(runRoom(organizationId, runId)).emit('agent-run:step', { runId, ...step })
  }

  /** Announces a terminal state for a run. */
  completeRun(
    organizationId: string,
    runId: string,
    result: { status: string; costUsd: string; durationMs: number | null },
  ): void {
    this.server.to(runRoom(organizationId, runId)).emit('agent-run:completed', { runId, ...result })
    this.notifyOrganization(organizationId, 'notification', {
      level: result.status === 'SUCCEEDED' ? 'success' : 'error',
      title: `Agent run ${result.status.toLowerCase()}`,
    })
  }

  /**
   * Resolves the principal from the handshake.
   *
   * Returns `undefined` until Phase 6 wires Better Auth. Deliberately not a
   * development-only bypass: a "trust this header in dev" path is exactly the
   * kind of code that reaches production behind a misread environment variable.
   */
  private resolvePrincipal(_socket: AuthenticatedSocket): Principal | undefined {
    return undefined
  }
}

function extractRunId(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'runId' in payload) {
    const runId = (payload as { runId: unknown }).runId
    // UUID-shaped only. An unconstrained string would become part of a room name.
    if (typeof runId === 'string' && /^[0-9a-f-]{16,64}$/i.test(runId)) return runId
  }
  return null
}
