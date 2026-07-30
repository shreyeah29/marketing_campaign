/**
 * Permission catalog and role mapping.
 *
 * Two layers, deliberately:
 *
 *   · **Roles** are what a customer administers. Nobody wants to tick forty
 *     checkboxes to add a teammate.
 *   · **Permissions** are what the code checks. A guard that tests
 *     `role === 'ADMIN'` accretes special cases until nobody can say what an
 *     admin may do; a guard that tests `campaigns:publish` stays answerable.
 *
 * The mapping between them lives here and nowhere else, so "what can a manager
 * do?" has exactly one answer and changing it is a reviewable diff.
 *
 * This is also what makes agent authorisation coherent. An agent's tool declares
 * the permission it needs, and it is checked against the *user* who started the
 * run — so an agent can never do something its principal could not.
 */

export const PERMISSIONS = {
  // Organisation and people
  ORG_READ: 'org:read',
  ORG_MANAGE: 'org:manage',
  MEMBERS_READ: 'members:read',
  MEMBERS_INVITE: 'members:invite',
  MEMBERS_MANAGE: 'members:manage',
  API_KEYS_MANAGE: 'api_keys:manage',

  // Billing is separated from org management: a marketing manager should be able
  // to run the workspace without being able to change the plan.
  BILLING_READ: 'billing:read',
  BILLING_MANAGE: 'billing:manage',

  // CRM
  CRM_READ: 'crm:read',
  CRM_WRITE: 'crm:write',
  CRM_DELETE: 'crm:delete',
  CRM_EXPORT: 'crm:export',

  // Campaigns and content. Publishing is separate from writing, because
  // publishing is the irreversible, outward-facing half.
  CAMPAIGNS_READ: 'campaigns:read',
  CAMPAIGNS_WRITE: 'campaigns:write',
  CAMPAIGNS_PUBLISH: 'campaigns:publish',
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_APPROVE: 'content:approve',
  CONTENT_PUBLISH: 'content:publish',
  MEDIA_READ: 'media:read',
  MEDIA_WRITE: 'media:write',

  // Outbound. Each channel is its own permission because the blast radius and
  // the legal exposure differ — an email mistake is not a cold-call mistake.
  EMAIL_SEND: 'email:send',
  WHATSAPP_SEND: 'whatsapp:send',
  SOCIAL_PUBLISH: 'social:publish',
  VOICE_CALL: 'voice:call',

  // Automation and agents
  AUTOMATION_READ: 'automation:read',
  AUTOMATION_WRITE: 'automation:write',
  AUTOMATION_ACTIVATE: 'automation:activate',
  AGENTS_RUN: 'agents:run',
  AGENTS_APPROVE: 'agents:approve',

  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
  KNOWLEDGE_READ: 'knowledge:read',
  KNOWLEDGE_WRITE: 'knowledge:write',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

export type MemberRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'

const P = PERMISSIONS

/** Read-only across the product. The safe default for a new teammate. */
const VIEWER: readonly Permission[] = [
  P.ORG_READ,
  P.MEMBERS_READ,
  P.CRM_READ,
  P.CAMPAIGNS_READ,
  P.CONTENT_READ,
  P.MEDIA_READ,
  P.AUTOMATION_READ,
  P.ANALYTICS_READ,
  P.KNOWLEDGE_READ,
]

/**
 * Day-to-day contributor. Can create and draft, cannot publish or send.
 *
 * The split matters: drafting is reversible, publishing reaches the public and
 * sending reaches a customer's inbox. A new hire should be productive on day one
 * without being able to email the entire contact list.
 */
const MEMBER: readonly Permission[] = [
  ...VIEWER,
  P.CRM_WRITE,
  P.CAMPAIGNS_WRITE,
  P.CONTENT_WRITE,
  P.MEDIA_WRITE,
  P.AUTOMATION_WRITE,
  P.KNOWLEDGE_WRITE,
  P.AGENTS_RUN,
]

/** Owns outcomes: can publish, send, approve and activate. */
const MANAGER: readonly Permission[] = [
  ...MEMBER,
  P.CRM_DELETE,
  P.CRM_EXPORT,
  P.CAMPAIGNS_PUBLISH,
  P.CONTENT_APPROVE,
  P.CONTENT_PUBLISH,
  P.EMAIL_SEND,
  P.WHATSAPP_SEND,
  P.SOCIAL_PUBLISH,
  P.VOICE_CALL,
  P.AUTOMATION_ACTIVATE,
  P.AGENTS_APPROVE,
  P.MEMBERS_INVITE,
]

/** Runs the workspace. Notably still cannot change the plan. */
const ADMIN: readonly Permission[] = [
  ...MANAGER,
  P.ORG_MANAGE,
  P.MEMBERS_MANAGE,
  P.API_KEYS_MANAGE,
  P.AUDIT_READ,
  P.BILLING_READ,
]

/** Everything, including billing. */
const OWNER: readonly Permission[] = [...ADMIN, P.BILLING_MANAGE]

const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  VIEWER,
  MEMBER,
  MANAGER,
  ADMIN,
  OWNER,
}

/**
 * Effective permissions for a membership.
 *
 * Grants are additive on top of the role, so a customer can give one person a
 * single extra capability without promoting them. There is deliberately no
 * mechanism to *subtract* from a role: "admin except X" produces a permission
 * model nobody can reason about, and the answer is a lower role plus grants.
 */
export function effectivePermissions(
  role: MemberRole,
  additionalGrants: readonly string[] = [],
): ReadonlySet<Permission> {
  const permitted = new Set<Permission>(ROLE_PERMISSIONS[role])

  for (const grant of additionalGrants) {
    if ((ALL_PERMISSIONS as readonly string[]).includes(grant)) {
      permitted.add(grant as Permission)
    }
  }

  return permitted
}

export function roleHasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function permissionsForRole(role: MemberRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

/**
 * Validates the matrix at startup.
 *
 * Catches the two mistakes that are invisible in review: a permission that no
 * role can ever hold (dead code that looks like a control), and a role that is
 * not a superset of the one below it (which breaks the mental model everyone
 * relies on, including the UI that renders the role picker).
 */
export function assertPermissionMatrixValid(): void {
  const problems: string[] = []

  const granted = new Set<Permission>(Object.values(ROLE_PERMISSIONS).flatMap((list) => [...list]))
  for (const permission of ALL_PERMISSIONS) {
    if (!granted.has(permission)) {
      problems.push(`${permission} is declared but no role grants it — nothing can ever pass it`)
    }
  }

  const ladder: readonly MemberRole[] = ['VIEWER', 'MEMBER', 'MANAGER', 'ADMIN', 'OWNER']
  for (let i = 1; i < ladder.length; i += 1) {
    const lower = ladder[i - 1]
    const higher = ladder[i]
    if (lower === undefined || higher === undefined) continue

    const higherSet = new Set(ROLE_PERMISSIONS[higher])
    const missing = ROLE_PERMISSIONS[lower].filter((p) => !higherSet.has(p))
    if (missing.length > 0) {
      problems.push(`${higher} is missing permissions held by ${lower}: ${missing.join(', ')}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`Permission matrix is invalid:\n  - ${problems.join('\n  - ')}`)
  }
}
