import { Controller, Get, Inject, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import type { Principal } from '../../common/auth/principal.js'
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator.js'
import { RequirePermissions } from '../../common/guards/permissions.guard.js'
import { PERMISSIONS } from '../../common/rbac/permissions.js'
import { AdAnalyticsService, type DateRange } from './ad-analytics.service.js'

/**
 * Campaign & audience insights for clients. Read-only, tenant-scoped: every member
 * can see their own organisation's ad performance and audience so they understand
 * how to run better campaigns.
 */
@ApiTags('Campaign Analytics')
@Controller('meta/analytics')
export class AdAnalyticsController {
  constructor(@Inject(AdAnalyticsService) private readonly analytics: AdAnalyticsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Headline reach, spend, leads, CTR and CPL' })
  async summary(
    @CurrentPrincipal() p: Principal,
    @Query() q: DateRange,
  ): Promise<Record<string, number>> {
    return this.analytics.summary(p, q)
  }

  @Get('demographics')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Audience by age and gender' })
  async demographics(@CurrentPrincipal() p: Principal, @Query() q: DateRange): Promise<unknown> {
    return this.analytics.demographics(p, q)
  }

  @Get('geography')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Audience by region' })
  async geography(@CurrentPrincipal() p: Principal, @Query() q: DateRange): Promise<unknown> {
    return { data: await this.analytics.geography(p, q) }
  }

  @Get('timeseries')
  @RequirePermissions(PERMISSIONS.ORG_READ)
  @ApiOperation({ summary: 'Daily ad performance trend' })
  async timeseries(@CurrentPrincipal() p: Principal, @Query() q: DateRange): Promise<unknown> {
    return { data: await this.analytics.timeseries(p, q) }
  }
}
