import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { ChatbotService } from './chatbot.service.js'

const questionSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/i, 'key must be alphanumeric/underscore'),
  prompt: z.string().min(1).max(1000),
  type: z.enum(['text', 'choice']).optional(),
  options: z.array(z.string().min(1).max(120)).max(12).optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(200),
  questions: z.array(questionSchema).max(30),
  completionMessage: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
})

const updateSchema = createSchema.partial()

/**
 * WhatsApp chatbot flows, configured per client by the operator. These questions
 * are what make one client's bot differ from another's — the engine is shared, the
 * flow is data. Admin-gated: it shapes what leads are asked.
 */
@ApiTags('Chatbot')
@Controller('meta/chatbot-flows')
export class ChatbotController {
  constructor(@Inject(ChatbotService) private readonly flows: ChatbotService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Create a WhatsApp chatbot flow for this client' })
  async create(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ id: string }> {
    return this.flows.create(principal, zodBody(createSchema, body))
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'List this client’s chatbot flows' })
  async list(@CurrentPrincipal() principal: Principal): Promise<{ data: unknown[] }> {
    return { data: await this.flows.list(principal) }
  }

  @Put(':id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Update a chatbot flow' })
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.flows.update(principal, id, zodBody(updateSchema, body))
    return { ok: true }
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Delete a chatbot flow' })
  async remove(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    await this.flows.remove(principal, id)
    return { ok: true }
  }
}
