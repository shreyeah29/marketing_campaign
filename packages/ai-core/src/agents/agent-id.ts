/**
 * The twelve AI employees.
 *
 * Kept in its own module so `tool.ts` and `agent.ts` can both reference it
 * without a cycle. Values match the `AgentId` enum in the Prisma schema — the
 * database is the source of truth for the set, and a mismatch fails a test.
 */
export const AGENT_IDS = [
  'CMO',
  'COPYWRITER',
  'DESIGNER',
  'VIDEO_CREATOR',
  'EMAIL_SPECIALIST',
  'SEO_EXPERT',
  'CRM_ASSISTANT',
  'VOICE_AGENT',
  'WHATSAPP_AGENT',
  'SALES_AGENT',
  'ANALYTICS_AGENT',
  'AUTOMATION_AGENT',
] as const

export type AgentId = (typeof AGENT_IDS)[number]

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}
