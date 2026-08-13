import { Inject, Injectable, NotFoundException } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@marketing-os/database'

import type { Principal } from '../../common/auth/principal.js'
import { DATABASE } from '../../infrastructure/database.module.js'

/**
 * Per-client WhatsApp chatbot flows. Each organisation gets its own set of flows —
 * a lighting company's "pricing / stores / quote" questions and a gym's "book a
 * trial" questions are just different rows here, driving the same engine. Managed
 * by the operator during onboarding (org-scoped, admin-gated).
 */

export interface ChatbotQuestionInput {
  readonly key: string
  readonly prompt: string
  readonly type?: 'text' | 'choice' | undefined
  readonly options?: string[] | undefined
}

export interface ChatbotFlowInput {
  readonly name: string
  readonly questions: ChatbotQuestionInput[]
  readonly completionMessage?: string | undefined
  readonly isActive?: boolean | undefined
}

export interface UpdateChatbotFlowInput {
  readonly name?: string | undefined
  readonly questions?: ChatbotQuestionInput[] | undefined
  readonly completionMessage?: string | undefined
  readonly isActive?: boolean | undefined
}

@Injectable()
export class ChatbotService {
  constructor(@Inject(DATABASE) private readonly db: DatabaseClient) {}

  async create(_principal: Principal, input: ChatbotFlowInput): Promise<{ id: string }> {
    const flow = await withTenantTransaction(this.db, (tx) =>
      tx.chatbotFlow.create({
        data: {
          organizationId: _principal.organizationId,
          name: input.name,
          questions: input.questions as never,
          isActive: input.isActive ?? true,
          ...(input.completionMessage !== undefined
            ? { completionMessage: input.completionMessage }
            : {}),
        },
      }),
    )
    return { id: flow.id }
  }

  async list(_principal: Principal): Promise<unknown[]> {
    return withTenantTransaction(this.db, (tx) =>
      tx.chatbotFlow.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }),
    )
  }

  async update(_principal: Principal, id: string, input: UpdateChatbotFlowInput): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.chatbotFlow.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Chatbot flow not found.')
      await tx.chatbotFlow.update({
        where: { id: existing.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.questions !== undefined ? { questions: input.questions as never } : {}),
          ...(input.completionMessage !== undefined
            ? { completionMessage: input.completionMessage }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      })
    })
  }

  async remove(_principal: Principal, id: string): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const existing = await tx.chatbotFlow.findFirst({ where: { id, deletedAt: null } })
      if (!existing) throw new NotFoundException('Chatbot flow not found.')
      await tx.chatbotFlow.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), isActive: false },
      })
    })
  }
}
