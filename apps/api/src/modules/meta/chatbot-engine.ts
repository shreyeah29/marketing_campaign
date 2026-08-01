/**
 * The WhatsApp chatbot flow engine — pure, so the same code drives every client's
 * bot while the *behaviour* comes entirely from that client's configured flow.
 *
 * A flow is an ordered list of questions the client defines (name, city, product
 * interest, whatever their business needs). The engine tracks how far a prospect
 * has got and returns the next thing to say. It never talks to WhatsApp or the DB —
 * the worker does that around it — which is what makes it trivially testable and
 * identical across sectors: a lighting company and a gym differ only in their data.
 *
 * v1 is a structured question flow (operator-configured). Free-form knowledge
 * answering is a later addition; the shape here leaves room for it.
 */

export interface ChatbotQuestion {
  readonly key: string
  readonly prompt: string
  readonly type?: 'text' | 'choice'
  readonly options?: string[]
}

export interface ChatbotFlowConfig {
  readonly questions: ChatbotQuestion[]
  readonly completionMessage?: string
}

export type ChatbotStatus = 'ACTIVE' | 'COMPLETED' | 'HANDOFF'

export interface ChatbotSessionState {
  readonly currentStep: number
  readonly answers: Record<string, string>
  readonly status: ChatbotStatus
}

export interface AdvanceResult {
  /** Messages to send back to the prospect, in order. */
  readonly replies: string[]
  readonly answers: Record<string, string>
  readonly currentStep: number
  readonly status: ChatbotStatus
  /** True when the flow just finished — the worker turns this into a CRM lead. */
  readonly completed: boolean
}

// Phrases that route a prospect straight to a human agent, ending the bot flow.
const HANDOFF_PHRASES = ['agent', 'human', 'representative', 'talk to someone', 'speak to someone', 'real person']
const HANDOFF_MESSAGE = 'No problem — connecting you with our team. Someone will reply here shortly.'

function wantsHandoff(message: string): boolean {
  const m = message.toLowerCase()
  return HANDOFF_PHRASES.some((p) => m.includes(p))
}

/** Render a question, appending its options for a choice question. */
function render(question: ChatbotQuestion): string {
  if (question.type === 'choice' && question.options && question.options.length > 0) {
    return `${question.prompt}\n${question.options.map((o, i) => `${String(i + 1)}. ${o}`).join('\n')}`
  }
  return question.prompt
}

/**
 * Advance a chatbot session by one inbound message.
 *
 * `firstContact` marks the prospect's opening message (e.g. the "hi" from tapping a
 * Click-to-WhatsApp ad): it is not recorded as an answer — we simply ask the first
 * question. Every subsequent message answers the question we last asked.
 */
export function advance(
  flow: ChatbotFlowConfig,
  session: ChatbotSessionState,
  message: string,
  opts: { firstContact: boolean },
): AdvanceResult {
  const questions = flow.questions ?? []

  if (wantsHandoff(message)) {
    return {
      replies: [HANDOFF_MESSAGE],
      answers: session.answers,
      currentStep: session.currentStep,
      status: 'HANDOFF',
      completed: false,
    }
  }

  let currentStep = session.currentStep
  let answers = session.answers

  // Record the answer to the question we last asked (not on the opening message).
  if (!opts.firstContact && currentStep < questions.length) {
    const q = questions[currentStep]
    if (q) answers = { ...answers, [q.key]: message.trim() }
    currentStep += 1
  }

  // More questions to ask?
  if (currentStep < questions.length) {
    const next = questions[currentStep]
    return {
      replies: next ? [render(next)] : [],
      answers,
      currentStep,
      status: 'ACTIVE',
      completed: false,
    }
  }

  // Flow finished — say thanks and signal a lead should be created.
  return {
    replies: [flow.completionMessage ?? 'Thank you! Our team will be in touch shortly.'],
    answers,
    currentStep,
    status: 'COMPLETED',
    completed: true,
  }
}

/**
 * Parse a stored flow's `questions` JSON defensively into a typed config, dropping
 * malformed entries so a bad row can never crash the worker.
 */
export function parseFlowConfig(questions: unknown, completionMessage?: string | null): ChatbotFlowConfig {
  const list = Array.isArray(questions) ? questions : []
  const parsed: ChatbotQuestion[] = []
  for (const q of list) {
    if (q && typeof q === 'object' && typeof (q as ChatbotQuestion).key === 'string' && typeof (q as ChatbotQuestion).prompt === 'string') {
      const item = q as ChatbotQuestion
      parsed.push({
        key: item.key,
        prompt: item.prompt,
        ...(item.type ? { type: item.type } : {}),
        ...(Array.isArray(item.options) ? { options: item.options.filter((o) => typeof o === 'string') } : {}),
      })
    }
  }
  return { questions: parsed, ...(completionMessage ? { completionMessage } : {}) }
}
