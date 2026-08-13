/**
 * `@marketing-os/ai-core` — the AI operating system's contracts.
 *
 * This package contains no vendor SDK and never will. It defines what the
 * platform needs from a model, an image generator, a telephony provider; adapters
 * live in `@marketing-os/providers`. ESLint fails the build on a vendor import here, and on
 * `ai-core` importing `providers` — that inversion is what makes providers
 * swappable rather than merely abstracted on paper.
 */

export type {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
  ContentPart,
  ImagePart,
  LlmMessage,
  LlmPort,
  LlmToolSchema,
  MessageRole,
  ModelRequirements,
  TextPart,
  TokenUsage,
  ToolCallPart,
  ToolResultPart,
} from './ports/llm.port.js'

export {
  assertCatalogFresh,
  computeCost,
  estimateCost,
  findModel,
  MODEL_CATALOG,
  modelsForProvider,
  pricingFor,
  resolveModel,
  type CostInput,
  type ModelCapability,
  type ModelDescriptor,
  type ModelPricing,
  type PricingOverride,
  type ProviderId,
  type ResolveOptions,
} from './model-catalog.js'

export { AGENT_IDS, isAgentId, type AgentId } from './agents/agent-id.js'

export {
  AGENT_MANIFESTS,
  assertRosterValid,
  DEFAULT_SPECIALIST_BUDGET,
  findAgentManifest,
  ORCHESTRATOR_BUDGET,
  type AgentDefinition,
  type BudgetPolicy,
  type PromptTemplate,
} from './agents/agent.js'

export {
  defineTool,
  executeTool,
  toModelFacingTool,
  type AnyToolDefinition,
  type ApprovalPolicy,
  type CommandDispatcher,
  type JsonSchemaConverter,
  type ModelFacingTool,
  type Permission,
  type PermissionChecker,
  type ToolContext,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolOutcome,
} from './agents/tool.js'

export {
  addUsd,
  checkBudget,
  compareUsd,
  type BudgetDecision,
  type OrganizationBudget,
  type SpendSnapshot,
  type UsageMeter,
  type UsageRecord,
} from './governance/budget.js'
