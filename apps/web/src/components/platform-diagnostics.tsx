'use client'

import { useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform, type Diagnostics } from '@/lib/platform'
import { Icon } from '@/components/icon'

/**
 * What the running API can reach — the operator's first stop when something is
 * behaving oddly.
 *
 * Every row is a boolean from the API's own process, so it answers "is the key
 * resolving where it matters" rather than "is the key in the env panel". Those
 * two have differed three times: a Runway key set on the wrong service, a build
 * that never deployed, and a grant revoked out from under the boot check.
 *
 * The first row is the one that would have saved the most time. Vercel deploys
 * the frontend on every push; Render does not deploy the API unless it is told
 * to. So the UI regularly runs ahead of the API, and the symptom is a 404 on a
 * route that exists in `main` or a field that arrives undefined — neither of
 * which points at the cause. Comparing the two build commits states it outright.
 */

/**
 * The commit this bundle was built from.
 *
 * Vercel exposes it automatically; locally it is absent, which is correct — a dev
 * server has no deployed commit to disagree with, so the row hides itself rather
 * than inventing a mismatch.
 */
const WEB_COMMIT = (process.env['NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA'] ?? '').slice(0, 7)

function Row({
  label,
  ok,
  detail,
  tone = 'binary',
}: {
  label: string
  ok: boolean
  detail?: string | undefined
  tone?: 'binary' | 'warning' | undefined
}) {
  return (
    <div className="diag-row" data-state={ok ? 'ok' : tone === 'warning' ? 'warn' : 'off'}>
      <Icon
        name={ok ? 'check-circle' : tone === 'warning' ? 'alert-triangle' : 'circle'}
        size={15}
      />
      <span className="diag-row__label">{label}</span>
      {detail ? <span className="diag-row__detail">{detail}</span> : null}
      <span className="diag-row__state">
        {ok ? 'yes' : tone === 'warning' ? 'mismatch' : 'not set'}
      </span>
    </div>
  )
}

export function PlatformDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    platform
      .diagnostics()
      .then(setData)
      .catch((e: unknown) => {
        // A 404 here is not a broken panel — it is the build-skew finding
        // arriving by another route. This endpoint exists in every version of
        // the API that has it; if the deployed one answers 404, the deployed one
        // is older than this bundle, which is the single most useful thing the
        // panel could say.
        if (e instanceof ApiError && e.status === 404) {
          setError(
            'The deployed API does not have this endpoint yet — it is older than this frontend build. Deploy the API.',
          )
          return
        }
        setError(e instanceof ApiError ? e.message : 'Could not read diagnostics')
      })
  }, [])

  if (error) {
    return (
      <div className="card diag">
        <div className="diag-row" data-state="warn">
          <Icon name="alert-triangle" size={15} />
          <span className="diag-row__label">System</span>
          <span className="diag-row__detail">{error}</span>
        </div>
      </div>
    )
  }
  if (!data) return null

  // Only meaningful when both sides know their commit. Locally the web commit is
  // empty and the API's may be "unknown", and neither is a mismatch.
  const canCompare = WEB_COMMIT.length > 0 && data.commit !== 'unknown'
  const commitsAgree = canCompare && WEB_COMMIT === data.commit

  const staleFor =
    data.worker.lastInsightSyncAt === null
      ? null
      : Math.round((Date.now() - new Date(data.worker.lastInsightSyncAt).getTime()) / 60_000)

  return (
    <div className="card diag">
      <div className="diag__head">
        System
        <span className="diag__env">{data.environment}</span>
      </div>

      {/* The build-skew row, first and loudest. */}
      {canCompare && !commitsAgree ? (
        <div className="diag-row" data-state="warn">
          <Icon name="alert-triangle" size={15} />
          <span className="diag-row__label">Frontend is ahead of the API</span>
          <span className="diag-row__detail">
            web {WEB_COMMIT} · api {data.commit}
          </span>
          <span className="diag-row__state">deploy the API</span>
        </div>
      ) : (
        <Row
          label="Build"
          ok
          detail={canCompare ? `web and api both ${data.commit}` : `api ${data.commit}`}
        />
      )}

      <div className="diag__group">Generation</div>
      <Row label="Runway key" ok={data.providers.runway} detail="posters and video" />
      <Row label="OpenAI key" ok={data.providers.openai} detail="copy and embeddings" />
      {data.providers.runwayImageModelOverride ? (
        <Row label="Runway image model override" ok detail="not using the default" />
      ) : null}
      {data.providers.runwayVideoModelOverride ? (
        <Row label="Runway video model override" ok detail="not using the default" />
      ) : null}

      <div className="diag__group">Delivery</div>
      <Row
        label="Durable media storage"
        ok={data.storage.supabase}
        detail={data.storage.supabase ? undefined : 'provider URLs expire within days'}
        tone={data.storage.supabase ? 'binary' : 'warning'}
      />
      <Row
        label="Email"
        ok={data.providers.resend}
        detail={data.providers.resend ? undefined : 'allowance alerts would log, not send'}
      />
      <Row label="Meta app credentials" ok={data.providers.metaApp} />

      <div className="diag__group">Infrastructure</div>
      <Row label="Redis" ok={data.infrastructure.redis} detail="render queue" />
      <Row label="Owner database connection" ok={data.infrastructure.directDatabaseUrl} />

      <div className="diag__group">Insight sync</div>
      <Row
        label="Connected ad accounts"
        ok={data.worker.connectedAdAccounts > 0}
        detail={`${String(data.worker.connectedAdAccounts)} connected`}
      />
      {/* Null with zero rows means nothing has ever synced; null with rows would
          be strange. Saying which removes the ambiguity from the timestamp. */}
      <Row
        label="Last insight written"
        ok={staleFor !== null}
        detail={
          staleFor !== null
            ? `${String(staleFor)} min ago · ${String(data.worker.insightRows)} rows`
            : data.worker.insightRows === 0
              ? 'never — no ad spend has synced yet'
              : `never, but ${String(data.worker.insightRows)} rows exist`
        }
      />

      <p className="diag__note">
        Booleans only — no key, secret or amount is returned by this endpoint. It reports what the
        running API process can resolve, which is not always what the env panel says.
      </p>
    </div>
  )
}
