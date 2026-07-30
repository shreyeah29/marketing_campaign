import { z } from 'zod'

import type { AgentId } from './agent-id.js'

/**
 * The tool protocol.
 *
 * A tool is the only way an agent affects the world. That single constraint is
 * what makes the platform auditable: every AI action is a typed, validated,
 * permission-checked call that dispatches a CQRS command — the same command a
 * human clicking a button would dispatch. There is no path where an agent writes
 * to the database directly, so there is no path where an AI action skips
 * validation, authorisation, or the audit log.
 *
 * The previous system had the inverse arrangement: "AI" meant a text generator
 * whose output a controller pasted into a row. Nothing recorded which model
 * produced it, on whose authority, or at what cost.
 */

/** What a tool may do, checked before execution. */
export type Permission = string

export interface ToolContext {
  readonly organizationId: string
  /**
   * The principal the agent is acting for. An agent can never exceed this user's
   * permissions — the whole authorisation model rests on that, so it is required
   * rather than optional.
   */
  readonly userId: string
  readonly agentRunId: string
  readonly agentId: AgentId
  /** Correlates the tool call with logs, events and the audit entry. */
  readonly requestId: string
  /**
   * Stable key derived from the tool's input. Passed to the command so a retried
   * tool call cannot send the same email or place the same call twice.
   */
  readonly idempotencyKey: string
  /** Cancels in-flight work when a run is cancelled or times out. */
  readonly signal: AbortSignal
}

/**
 * Dispatches a command. Supplied by the host application.
 *
 * Typed as a port so `ai-core` does not depend on NestJS. It is the seam through
 * which every tool reaches the domain, and the reason a tool cannot bypass it:
 * a tool is handed this and nothing else.
 */
export interface CommandDispatcher {
  dispatch<TResult>(commandName: string, payload: unknown, context: ToolContext): Promise<TResult>
}

export interface ToolExecutionContext extends ToolContext {
  readonly dispatch: CommandDispatcher['dispatch']
}

/**
 * A tool definition.
 *
 * Input and output are Zod schemas rather than plain JSON Schema so authors get
 * inference and runtime validation from one declaration. Model-facing JSON
 * Schema is derived from them, which keeps the two from drifting — a schema the
 * model sees but the code does not enforce is how malformed tool calls become
 * corrupt rows.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string
  /**
   * Read by the model to decide whether to call this tool. Written for the
   * model, not for a developer: state *when* to use it, not only what it does.
   * Vague descriptions are the usual cause of a tool that never fires or fires
   * constantly.
   */
  readonly description: string
  readonly input: z.ZodType<TInput>
  readonly output: z.ZodType<TOutput>
  /**
   * Permission required to execute. Checked against the initiating user's
   * effective permissions before the tool runs — an agent inherits authority, it
   * does not hold its own.
   */
  readonly requiredPermission: Permission
  /**
   * True when the tool changes state or spends money. Used to decide whether an
   * approval gate applies at the organisation's configured autonomy level, and
   * whether a retry needs an idempotency key.
   */
  readonly mutating: boolean
  /**
   * Estimated cost in US dollars, where the tool spends beyond model tokens —
   * an image generation, a phone call. Fed into budget enforcement before
   * dispatch, because refusing after the money is spent is not enforcement.
   */
  readonly estimatedCostUsd?: (input: TInput) => string
  /** Derives the idempotency key from the input. Defaults to a hash of it. */
  readonly idempotencyKey?: (input: TInput) => string

  execute(input: TInput, context: ToolExecutionContext): Promise<TOutput>
}

/** Any tool, for registries and heterogeneous collections. */
export type AnyToolDefinition = ToolDefinition<never, unknown>

/**
 * Declares a tool with inference preserved.
 *
 * A plain object literal would widen the generics and lose the link between the
 * schemas and the `execute` signature, which is exactly the type safety the
 * protocol exists to provide.
 */
export function defineTool<TInput, TOutput>(
  definition: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return definition
}

export type ToolOutcome<TOutput> =
  | { readonly status: 'ok'; readonly output: TOutput }
  | { readonly status: 'denied'; readonly reason: string; readonly permission: Permission }
  | { readonly status: 'invalid_input'; readonly issues: readonly string[] }
  | { readonly status: 'invalid_output'; readonly issues: readonly string[] }
  | { readonly status: 'failed'; readonly error: string; readonly retryable: boolean }
  | { readonly status: 'requires_approval'; readonly summary: string }

/**
 * Checks permissions. Supplied by the host's IAM module.
 *
 * `hasPermission` takes the *user* id, not the agent: the question is always
 * whether the human who started this run may do the thing, never whether the
 * agent may.
 */
export interface PermissionChecker {
  hasPermission(organizationId: string, userId: string, permission: Permission): Promise<boolean>
}

/**
 * Decides whether a mutating tool call needs a human first.
 *
 * Driven by the organisation's autonomy level, so the same agent can run
 * supervised for a cautious customer and unsupervised for a confident one
 * without a code change.
 */
export interface ApprovalPolicy {
  requiresApproval(tool: AnyToolDefinition, organizationId: string): Promise<boolean>
}

/**
 * Executes a tool through the full guard sequence.
 *
 * Order matters and is not arbitrary:
 *   1. Validate input   — never dispatch a command built from a malformed call.
 *   2. Check permission — before any side effect, and against the *user*.
 *   3. Check approval   — pause mutating work when the tenant requires it.
 *   4. Execute.
 *   5. Validate output  — a tool that returns the wrong shape is a bug now,
 *                         not a confusing failure three steps later.
 *
 * Every outcome is a value rather than a thrown error, because each is recorded
 * on the tool-call ledger. A denial is as much a fact worth auditing as a
 * success — arguably more.
 */
export async function executeTool<TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  rawInput: unknown,
  context: ToolExecutionContext,
  guards: { readonly permissions: PermissionChecker; readonly approvals: ApprovalPolicy },
): Promise<ToolOutcome<TOutput>> {
  const parsedInput = tool.input.safeParse(rawInput)
  if (!parsedInput.success) {
    return {
      status: 'invalid_input',
      issues: parsedInput.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  }

  const permitted = await guards.permissions.hasPermission(
    context.organizationId,
    context.userId,
    tool.requiredPermission,
  )

  if (!permitted) {
    return {
      status: 'denied',
      permission: tool.requiredPermission,
      reason:
        `${tool.name} requires "${tool.requiredPermission}", which the initiating user does not ` +
        'have. An agent cannot exceed the permissions of the principal that started its run.',
    }
  }

  if (tool.mutating) {
    const needsApproval = await guards.approvals.requiresApproval(
      tool as unknown as AnyToolDefinition,
      context.organizationId,
    )
    if (needsApproval) {
      return {
        status: 'requires_approval',
        summary: `${tool.name} changes state and this organisation requires review first.`,
      }
    }
  }

  let raw: unknown
  try {
    raw = await tool.execute(parsedInput.data, context)
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    return {
      status: 'failed',
      error: failure.message,
      // Aborts are the run being cancelled, not a transient fault — retrying
      // would resurrect work someone deliberately stopped.
      retryable: failure.name !== 'AbortError',
    }
  }

  const parsedOutput = tool.output.safeParse(raw)
  if (!parsedOutput.success) {
    return {
      status: 'invalid_output',
      issues: parsedOutput.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  }

  return { status: 'ok', output: parsedOutput.data }
}

/**
 * Converts a tool definition into the JSON Schema shape a model expects.
 *
 * Derived from the Zod schema rather than maintained alongside it, so the
 * contract the model is shown is the contract the code enforces.
 */
export interface ModelFacingTool {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

export type JsonSchemaConverter = (schema: z.ZodType<unknown>) => Record<string, unknown>

export function toModelFacingTool(
  tool: AnyToolDefinition,
  toJsonSchema: JsonSchemaConverter,
): ModelFacingTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toJsonSchema(tool.input as z.ZodType<unknown>),
  }
}
