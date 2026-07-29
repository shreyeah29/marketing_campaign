// Thin HTTP adapter — same interface as before, now hits the backend API.
// When real LLM keys are added server-side, no frontend changes are needed.

import { aiApi } from '@/services/api'

export interface AIServiceInterface {
  generateCampaign(prompt: string): Promise<CampaignResult>
  generateContent(type: string, brief: string): Promise<string>
  generateInsights(data?: Record<string, unknown>): Promise<string[]>
}

export interface CampaignSection {
  id: string
  title: string
  content: string
  type: string
}

export interface CampaignResult {
  sections: CampaignSection[]
  summary: string
}

export const MockAIService: AIServiceInterface = {
  async generateCampaign(prompt: string): Promise<CampaignResult> {
    const result = await aiApi.generateCampaign(prompt)
    return {
      summary: result.summary,
      sections: result.sections.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        content: s.content,
      })),
    }
  },

  async generateContent(type: string, brief: string): Promise<string> {
    const result = await aiApi.generateContent(type, brief)
    return result.content
  },

  async generateInsights(): Promise<string[]> {
    const result = await aiApi.insights()
    return result.map((i) => i.text)
  },
}
