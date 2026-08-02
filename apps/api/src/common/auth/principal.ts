import type { Permission, MemberRole } from '../rbac/permissions.js'

/**
 * The authenticated caller.
 *
 * One shape whether the request came from a browser session, an API key, or a
 * worker replaying a job. Downstream code should never have to ask "which kind of
 * caller is this?" to decide what it may do — it asks about permissions.
 *
 * `permissions` is resolved once per request, at authentication time, rather than
 * looked up per guard. Two reasons: a guard that queries the database is a guard
 * people avoid adding, and a permission set that can change mid-request produces
 * decisions that contradict each other within one operation.
 */
export interface Principal {
  readonly type: 'user' | 'api_key' | 'system'
  /** User id, or the API key's id. */
  readonly id: string
  readonly organizationId: string
  readonly role: MemberRole
  readonly permissions: ReadonlySet<Permission>
  readonly sessionId?: string
  readonly email?: string
  readonly displayName?: string
  /**
   * Present when a platform admin is viewing this organisation through the
   * view-as bridge. Always read-only: the ReadOnlySessionGuard rejects every
   * mutating request carrying this, and the tenant transaction opens READ ONLY.
   */
  readonly impersonation?: {
    readonly platformAdminId: string
    readonly readOnly: true
  }
}

export function can(principal: Principal, permission: Permission): boolean {
  return principal.permissions.has(permission)
}

export function canAll(principal: Principal, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => principal.permissions.has(permission))
}

/**
 * The system principal, for work with no human initiator — the outbox
 * dispatcher, scheduled rollups, webhook ingestion.
 *
 * It holds **no** permissions on purpose. System work runs through explicitly
 * unscoped repositories, not by holding a superuser token; a system principal
 * that could pass any permission check would be a standing privilege escalation
 * waiting for a bug to find it.
 */
export function systemPrincipal(organizationId: string): Principal {
  return {
    type: 'system',
    id: 'system',
    organizationId,
    role: 'VIEWER',
    permissions: new Set(),
  }
}
