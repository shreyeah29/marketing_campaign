import { describe, expect, it } from 'vitest'

import { advance, parseFlowConfig, type ChatbotFlowConfig, type ChatbotSessionState } from '../chatbot-engine.js'

const FLOW: ChatbotFlowConfig = {
  questions: [
    { key: 'name', prompt: 'What is your name?' },
    { key: 'city', prompt: 'Which city are you in?' },
    { key: 'interest', prompt: 'What are you interested in?', type: 'choice', options: ['Pricing', 'Stores'] },
  ],
  completionMessage: 'Thanks! Our team will reach out.',
}

const fresh: ChatbotSessionState = { currentStep: 0, answers: {}, status: 'ACTIVE' }

describe('chatbot advance — a per-client structured flow', () => {
  it('asks the first question on the opening message without recording it', () => {
    const r = advance(FLOW, fresh, 'hi', { firstContact: true })
    expect(r.replies).toEqual(['What is your name?'])
    expect(r.answers).toEqual({})
    expect(r.currentStep).toBe(0)
    expect(r.completed).toBe(false)
  })

  it('records an answer and asks the next question', () => {
    const r = advance(FLOW, fresh, 'Asha', { firstContact: false })
    expect(r.answers).toEqual({ name: 'Asha' })
    expect(r.currentStep).toBe(1)
    expect(r.replies).toEqual(['Which city are you in?'])
  })

  it('renders a choice question with numbered options', () => {
    const state: ChatbotSessionState = { currentStep: 1, answers: { name: 'Asha' }, status: 'ACTIVE' }
    const r = advance(FLOW, state, 'Hyderabad', { firstContact: false })
    expect(r.answers).toMatchObject({ city: 'Hyderabad' })
    expect(r.replies[0]).toContain('What are you interested in?')
    expect(r.replies[0]).toContain('1. Pricing')
    expect(r.replies[0]).toContain('2. Stores')
  })

  it('completes the flow and signals a lead after the last answer', () => {
    const state: ChatbotSessionState = {
      currentStep: 2,
      answers: { name: 'Asha', city: 'Hyderabad' },
      status: 'ACTIVE',
    }
    const r = advance(FLOW, state, 'Pricing', { firstContact: false })
    expect(r.answers).toEqual({ name: 'Asha', city: 'Hyderabad', interest: 'Pricing' })
    expect(r.status).toBe('COMPLETED')
    expect(r.completed).toBe(true)
    expect(r.replies).toEqual(['Thanks! Our team will reach out.'])
  })

  it('routes to a human on a handoff request, at any point', () => {
    const r = advance(FLOW, fresh, 'can I talk to someone?', { firstContact: false })
    expect(r.status).toBe('HANDOFF')
    expect(r.completed).toBe(false)
    expect(r.replies[0]).toMatch(/team/i)
  })

  it('completes immediately when a flow has no questions', () => {
    const r = advance({ questions: [] }, fresh, 'hi', { firstContact: true })
    expect(r.completed).toBe(true)
    expect(r.status).toBe('COMPLETED')
  })
})

describe('parseFlowConfig', () => {
  it('keeps well-formed questions and drops malformed ones', () => {
    const cfg = parseFlowConfig(
      [
        { key: 'name', prompt: 'Name?' },
        { key: 'bad' }, // no prompt
        'garbage',
        { key: 'city', prompt: 'City?', type: 'choice', options: ['A', 2, 'B'] },
      ],
      'Done!',
    )
    expect(cfg.questions).toHaveLength(2)
    expect(cfg.questions[1]!.options).toEqual(['A', 'B'])
    expect(cfg.completionMessage).toBe('Done!')
  })

  it('tolerates non-array questions', () => {
    expect(parseFlowConfig(null).questions).toEqual([])
  })
})
