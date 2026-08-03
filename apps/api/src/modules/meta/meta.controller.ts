import { Body, Controller, Delete, Get, Inject, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { zodBody } from '../../common/http/validate.js'
import { MetaConnectService, type MetaConnectionView } from './meta-connect.service.js'

const exchangeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

const assetsSchema = z
  .object({
    adAccountId: z.string().min(1).optional(),
    pageId: z.string().min(1).optional(),
    igUserId: z.string().min(1).optional(),
    wabaId: z.string().min(1).optional(),
    phoneNumberId: z.string().min(1).optional(),
  })
  .strict()

/**
 * Connecting a client's Meta assets (Facebook Page, Instagram, ad account,
 * WhatsApp) via delegated OAuth. This is the one place a customer authorises the
 * platform to act on their behalf — a "Connect" button, never an API key. Every
 * route is gated on org management; storing the token is the sensitive part.
 */
@ApiTags('Meta')
@Controller('meta')
export class MetaController {
  // `@Inject` is mandatory here, not stylistic. Production runs the API through
  // tsx (esbuild), which does not implement `emitDecoratorMetadata` — so
  // `design:paramtypes` is never emitted no matter what tsconfig says. Nest then
  // sees a constructor with no parameters, builds the controller with none, and
  // every dependency is silently `undefined` until a request dereferences it.
  // Injecting by explicit token is what every other controller in this codebase
  // does, and it is the only form that survives the runtime.
  constructor(@Inject(MetaConnectService) private readonly connect: MetaConnectService) {}

  @Get('oauth/url')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'The URL to send a client to in order to connect Meta' })
  authUrl(@CurrentPrincipal() principal: Principal): { url: string } {
    return { url: this.connect.authUrl(principal) }
  }

  @Post('oauth/exchange')
  @RequirePermissions(PERMISSIONS.API_KEYS_MANAGE)
  @ApiOperation({ summary: 'Exchange the OAuth code for a stored, encrypted connection' })
  async exchange(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<MetaConnectionView> {
    const input = zodBody(exchangeSchema, body)
    return this.connect.handleCallback(principal, input.code, input.state)
  }

  @Get('connection')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'This organisation’s Meta connection (never the token)' })
  async connection(@CurrentPrincipal() principal: Principal): Promise<MetaConnectionView | null> {
    return this.connect.getConnection(principal)
  }

  @Put('connection/assets')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Choose which ad account / Page / Instagram / WhatsApp to use' })
  async selectAssets(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ ok: true }> {
    const input = zodBody(assetsSchema, body)
    await this.connect.selectAssets(principal, input)
    return { ok: true }
  }

  @Delete('connection')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  @ApiOperation({ summary: 'Disconnect Meta for this organisation' })
  async disconnect(@CurrentPrincipal() principal: Principal): Promise<{ ok: true }> {
    await this.connect.disconnect(principal)
    return { ok: true }
  }
}
