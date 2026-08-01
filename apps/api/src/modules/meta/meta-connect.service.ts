import { createHmac, timingSafeEqual } from 'node:crypto'

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'

import { withTenantTransaction, type DatabaseClient } from '@vsp/database'

import type { Principal } from '../../common/auth/principal.js'
import { EncryptionService } from '../../common/crypto/encryption.service.js'
import { loadEnv } from '../../config/env.js'
import { DATABASE } from '../../infrastructure/database.module.js'
import { MetaGraphClient } from './meta-graph.client.js'

/**
 * The Meta connection lifecycle: a client authorises the platform's Meta App to
 * act on their assets (delegated OAuth — never a pasted key), and we store the
 * resulting long-lived token, encrypted, against their organisation.
 *
 * Nothing here spends money or publishes; it only establishes *who* we may act as.
 * The token is the one secret, sealed with the same envelope encryption as every
 * other credential and referenced from `MetaConnection.credentialId`.
 */

// Permissions the platform app requests. Advanced access to these is what Meta's
// App Review grants; until then they work for the app's own admins/testers.
const SCOPES = [
  'ads_management',
  'ads_read',
  'leads_retrieval',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'whatsapp_business_management',
  'whatsapp_business_messaging',
]

export interface MetaAssetOption {
  readonly id: string
  readonly name: string
}

export interface MetaConnectionView {
  readonly status: string
  readonly adAccountId: string | null
  readonly pageId: string | null
  readonly igUserId: string | null
  readonly wabaId: string | null
  readonly connectedAt: Date | null
  /** Discovered options the client can choose between (populated after connect). */
  readonly available?: {
    readonly adAccounts: MetaAssetOption[]
    readonly pages: MetaAssetOption[]
  }
}

interface MetaConfig {
  appId: string
  appSecret: string
  version: string
  redirectUri: string
  configId?: string
}

/** A decrypted, ready-to-use connection for downstream ad/WhatsApp services. */
export interface ResolvedMetaConnection {
  readonly accessToken: string
  readonly version: string
  readonly appSecret: string
  readonly adAccountId: string | null
  readonly pageId: string | null
  readonly igUserId: string | null
  readonly wabaId: string | null
  readonly phoneNumberId: string | null
}

@Injectable()
export class MetaConnectService {
  constructor(
    @Inject(DATABASE) private readonly db: DatabaseClient,
    @Inject(EncryptionService) private readonly encryption: EncryptionService,
  ) {}

  /** Resolve + validate operator config, or fail with a clean 503. */
  private config(): MetaConfig {
    const env = loadEnv()
    if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_OAUTH_REDIRECT_URI) {
      throw new ServiceUnavailableException('Meta is not configured on this deployment')
    }
    return {
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      version: env.META_GRAPH_VERSION,
      redirectUri: env.META_OAUTH_REDIRECT_URI,
      ...(env.META_CONFIG_ID ? { configId: env.META_CONFIG_ID } : {}),
    }
  }

  /**
   * Sign the organisation id into an opaque `state`, so the OAuth round-trip can't
   * be pointed at a different tenant. Verified in {@link handleCallback}.
   */
  private signState(organizationId: string): string {
    const cfg = this.config()
    const mac = createHmac('sha256', cfg.appSecret).update(organizationId).digest('hex')
    return `${organizationId}.${mac}`
  }

  private verifyState(state: string, organizationId: string): boolean {
    const expected = this.signState(organizationId)
    const a = Buffer.from(state)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /** The URL a client is sent to in order to authorise the connection. */
  authUrl(principal: Principal): string {
    const cfg = this.config()
    const url = new URL(`https://www.facebook.com/${cfg.version}/dialog/oauth`)
    url.searchParams.set('client_id', cfg.appId)
    url.searchParams.set('redirect_uri', cfg.redirectUri)
    url.searchParams.set('state', this.signState(principal.organizationId))
    url.searchParams.set('response_type', 'code')
    if (cfg.configId) url.searchParams.set('config_id', cfg.configId)
    else url.searchParams.set('scope', SCOPES.join(','))
    return url.toString()
  }

  /**
   * Handle the OAuth redirect: verify state, exchange the code for a long-lived
   * token, discover the client's assets, and persist an encrypted connection.
   */
  async handleCallback(
    principal: Principal,
    code: string,
    state: string,
  ): Promise<MetaConnectionView> {
    const cfg = this.config()
    if (!this.verifyState(state, principal.organizationId)) {
      throw new ServiceUnavailableException('Invalid OAuth state')
    }

    const shortToken = await this.exchangeCode(cfg, code)
    const { accessToken, expiresIn } = await this.exchangeForLongLived(cfg, shortToken)

    const graph = new MetaGraphClient({
      accessToken,
      version: cfg.version,
      appSecret: cfg.appSecret,
    })
    const [adAccounts, pages, businessId] = await Promise.all([
      this.discoverAdAccounts(graph),
      this.discoverPages(graph),
      this.discoverBusinessId(graph),
    ])

    // Default to the first of each; the client can change the selection afterwards.
    const adAccount = adAccounts[0]
    const page = pages[0]
    const igUserId = page?.igUserId ?? null

    const sealed = this.encryption.seal({ accessToken })
    const maskedHint = this.encryption.maskHint(accessToken)
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null

    await withTenantTransaction(this.db, async (tx) => {
      const credential = await tx.providerCredential.create({
        data: {
          organizationId: principal.organizationId,
          kind: 'SOCIAL' as never,
          provider: 'meta',
          ciphertext: new Uint8Array(sealed.ciphertext),
          iv: new Uint8Array(sealed.iv),
          authTag: new Uint8Array(sealed.authTag),
          wrappedKey: new Uint8Array(sealed.wrappedKey),
          keyVersion: sealed.keyVersion,
          maskedHint,
        },
      })

      await tx.metaConnection.upsert({
        where: { organizationId: principal.organizationId },
        create: {
          organizationId: principal.organizationId,
          status: 'CONNECTED',
          credentialId: credential.id,
          tokenExpiresAt,
          connectedById: principal.id,
          connectedAt: new Date(),
          ...(businessId ? { businessId } : {}),
          ...(adAccount ? { adAccountId: adAccount.id } : {}),
          ...(page ? { pageId: page.id } : {}),
          ...(igUserId ? { igUserId } : {}),
          lastError: null,
        },
        update: {
          status: 'CONNECTED',
          credentialId: credential.id,
          tokenExpiresAt,
          connectedById: principal.id,
          connectedAt: new Date(),
          ...(businessId ? { businessId } : {}),
          ...(adAccount ? { adAccountId: adAccount.id } : {}),
          ...(page ? { pageId: page.id } : {}),
          ...(igUserId ? { igUserId } : {}),
          lastError: null,
        },
      })

      await tx.auditLog.create({
        data: {
          organizationId: principal.organizationId,
          actorType: 'USER',
          userId: principal.id,
          action: 'meta.connected',
          resourceType: 'meta_connection',
          resourceId: principal.organizationId,
          after: { adAccountId: adAccount?.id ?? null, pageId: page?.id ?? null, hint: maskedHint },
        },
      })
    })

    return {
      status: 'CONNECTED',
      adAccountId: adAccount?.id ?? null,
      pageId: page?.id ?? null,
      igUserId,
      wabaId: null,
      connectedAt: new Date(),
      available: {
        adAccounts: adAccounts.map((a) => ({ id: a.id, name: a.name })),
        pages: pages.map((p) => ({ id: p.id, name: p.name })),
      },
    }
  }

  /** Current connection for the org, without ever returning the token. */
  async getConnection(principal: Principal): Promise<MetaConnectionView | null> {
    const conn = await withTenantTransaction(this.db, (tx) =>
      tx.metaConnection.findUnique({ where: { organizationId: principal.organizationId } }),
    )
    if (!conn) return null
    return {
      status: conn.status,
      adAccountId: conn.adAccountId,
      pageId: conn.pageId,
      igUserId: conn.igUserId,
      wabaId: conn.wabaId,
      connectedAt: conn.connectedAt,
    }
  }

  /** Change which ad account / page / IG / WhatsApp assets the org acts through. */
  async selectAssets(
    principal: Principal,
    assets: {
      adAccountId?: string | undefined
      pageId?: string | undefined
      igUserId?: string | undefined
      wabaId?: string | undefined
      phoneNumberId?: string | undefined
    },
  ): Promise<void> {
    await withTenantTransaction(this.db, (tx) =>
      tx.metaConnection.update({
        where: { organizationId: principal.organizationId },
        data: {
          ...(assets.adAccountId !== undefined ? { adAccountId: assets.adAccountId } : {}),
          ...(assets.pageId !== undefined ? { pageId: assets.pageId } : {}),
          ...(assets.igUserId !== undefined ? { igUserId: assets.igUserId } : {}),
          ...(assets.wabaId !== undefined ? { wabaId: assets.wabaId } : {}),
          ...(assets.phoneNumberId !== undefined ? { phoneNumberId: assets.phoneNumberId } : {}),
        },
      }),
    )
  }

  /** Disconnect: mark revoked and drop the credential reference. */
  async disconnect(principal: Principal): Promise<void> {
    await withTenantTransaction(this.db, async (tx) => {
      const conn = await tx.metaConnection.findUnique({
        where: { organizationId: principal.organizationId },
      })
      if (!conn) return
      if (conn.credentialId) {
        await tx.providerCredential
          .delete({ where: { id: conn.credentialId } })
          .catch(() => undefined)
      }
      await tx.metaConnection.update({
        where: { organizationId: principal.organizationId },
        data: { status: 'REVOKED', credentialId: null },
      })
    })
  }

  /**
   * Decrypt the connection for downstream services (ad publishing, WhatsApp,
   * insights). Returns null when there is no usable, connected token.
   */
  async resolve(principal: Principal): Promise<ResolvedMetaConnection | null> {
    const cfg = this.config()
    const conn = await withTenantTransaction(this.db, (tx) =>
      tx.metaConnection.findUnique({ where: { organizationId: principal.organizationId } }),
    )
    if (!conn || conn.status !== 'CONNECTED' || !conn.credentialId) return null

    const cred = await withTenantTransaction(this.db, (tx) =>
      tx.providerCredential.findUnique({ where: { id: conn.credentialId! } }),
    )
    if (!cred) return null

    let opened: Record<string, unknown>
    try {
      opened = this.encryption.open({
        ciphertext: Buffer.from(cred.ciphertext),
        iv: Buffer.from(cred.iv),
        authTag: Buffer.from(cred.authTag),
        wrappedKey: Buffer.from(cred.wrappedKey),
        keyVersion: cred.keyVersion,
      })
    } catch {
      return null
    }
    const accessToken =
      typeof opened['accessToken'] === 'string' ? (opened['accessToken'] as string) : ''
    if (!accessToken) return null

    return {
      accessToken,
      version: cfg.version,
      appSecret: cfg.appSecret,
      adAccountId: conn.adAccountId,
      pageId: conn.pageId,
      igUserId: conn.igUserId,
      wabaId: conn.wabaId,
      phoneNumberId: conn.phoneNumberId,
    }
  }

  // ── OAuth token endpoints (no bearer token; client_id + secret in the query) ──

  private async exchangeCode(cfg: MetaConfig, code: string): Promise<string> {
    const url = new URL(`https://graph.facebook.com/${cfg.version}/oauth/access_token`)
    url.searchParams.set('client_id', cfg.appId)
    url.searchParams.set('client_secret', cfg.appSecret)
    url.searchParams.set('redirect_uri', cfg.redirectUri)
    url.searchParams.set('code', code)
    const body = await this.oauthGet(url)
    return body.access_token
  }

  private async exchangeForLongLived(
    cfg: MetaConfig,
    shortToken: string,
  ): Promise<{ accessToken: string; expiresIn?: number }> {
    const url = new URL(`https://graph.facebook.com/${cfg.version}/oauth/access_token`)
    url.searchParams.set('grant_type', 'fb_exchange_token')
    url.searchParams.set('client_id', cfg.appId)
    url.searchParams.set('client_secret', cfg.appSecret)
    url.searchParams.set('fb_exchange_token', shortToken)
    const body = await this.oauthGet(url)
    return {
      accessToken: body.access_token,
      ...(typeof body.expires_in === 'number' ? { expiresIn: body.expires_in } : {}),
    }
  }

  private async oauthGet(url: URL): Promise<{ access_token: string; expires_in?: number }> {
    const res = await fetch(url)
    if (!res.ok) {
      throw new ServiceUnavailableException('Meta authorisation failed')
    }
    return (await res.json()) as { access_token: string; expires_in?: number }
  }

  // ── Asset discovery ──────────────────────────────────────────────────────────

  private async discoverAdAccounts(graph: MetaGraphClient): Promise<MetaAssetOption[]> {
    const res = await graph
      .get<{ data?: { account_id?: string; id?: string; name?: string }[] }>('me/adaccounts', {
        fields: 'account_id,name',
        limit: 100,
      })
      .catch(() => ({ data: [] as { account_id?: string; id?: string; name?: string }[] }))
    return (res.data ?? [])
      .map((a) => ({
        id: a.id ?? (a.account_id ? `act_${a.account_id}` : ''),
        name: a.name ?? 'Ad account',
      }))
      .filter((a) => a.id.length > 0)
  }

  private async discoverPages(
    graph: MetaGraphClient,
  ): Promise<(MetaAssetOption & { igUserId: string | null })[]> {
    const res = await graph
      .get<{
        data?: { id?: string; name?: string; instagram_business_account?: { id?: string } }[]
      }>('me/accounts', { fields: 'id,name,instagram_business_account', limit: 100 })
      .catch(() => ({
        data: [] as { id?: string; name?: string; instagram_business_account?: { id?: string } }[],
      }))
    return (res.data ?? [])
      .filter((p) => typeof p.id === 'string')
      .map((p) => ({
        id: p.id as string,
        name: p.name ?? 'Page',
        igUserId: p.instagram_business_account?.id ?? null,
      }))
  }

  private async discoverBusinessId(graph: MetaGraphClient): Promise<string | null> {
    const res = await graph
      .get<{ data?: { id?: string }[] }>('me/businesses', { fields: 'id,name', limit: 10 })
      .catch(() => ({ data: [] as { id?: string }[] }))
    return res.data?.[0]?.id ?? null
  }
}
