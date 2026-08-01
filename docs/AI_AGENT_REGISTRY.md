# AI Agent Registry

Agents are declarative manifests, not hardcoded classes. The roster is not a
fixed twelve: each organisation enables the agents it bought (`AgentAssignment`),
and can have bespoke agents (`CustomAgent`) defined without touching the code
roster.

- **Built-in manifests:** `packages/ai-core/src/agents/agent.ts` (`AGENT_MANIFESTS`)
- **Per-org enablement:** `agent_assignment` table (org ↔ agent, enabled, config)
- **Custom agents:** `custom_agent` table (org-specific role, prompt, tools)
- **Validated at boot:** `assertRosterValid()`

## Built-in agents (12)

`CMO` (the only one that plans and delegates) · `COPYWRITER` · `DESIGNER` ·
`VIDEO_CREATOR` · `EMAIL_SPECIALIST` · `SEO_EXPERT` · `CRM_ASSISTANT` ·
`VOICE_AGENT` · `WHATSAPP_AGENT` · `SALES_AGENT` · `ANALYTICS_AGENT` ·
`AUTOMATION_AGENT`

## Manifest shape

```ts
interface AgentDefinition {
  id: AgentId
  role: string
  purpose: string
  prompt: PromptTemplate // system prompt + declared {{variables}}
  tools: AnyToolDefinition[] // the ONLY way an agent affects the world
  requirements: ModelRequirements // capability, not a hardcoded model
  delegatesTo: AgentId[] // one level deep — only the CMO fans out
  budget: BudgetPolicy // enforced before dispatch
  producesCustomerFacingOutput: boolean
}
```

## The invariants

- **Every action is a tool → a CQRS command → the same auth + audit path as a
  human action.** No agent writes to the database directly.
- **An agent never exceeds the permissions of the user who started its run.**
  Tool permission is checked against the _initiator_, not the agent.
- **Cost is metered before dispatch** against the org's AI budget and limits.
- **Delegation is one level deep** — enforced, so run cost stays predictable.

## Custom agents

A `CustomAgent` row gives one client a bespoke AI employee (role, system prompt,
tool ids, model requirements) that plugs into the same run pipeline, budget
governance, tool authorisation and audit ledger as the built-ins. No core change.
