'use client'

import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform, type DirectionPreviewRun, type GenerationTest } from '@/lib/platform'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * "Does making a picture actually work?" — answered in one press.
 *
 * The diagnostics panel above this one reports whether each key is *set*. That
 * is a weaker question than whether it *works*, and the gap between them is
 * where every generation incident has lived: a key set and rejected, a key valid
 * for chat but not for images, an image drawn and then impossible to store. All
 * three look identical from a client's seat — a poster that never appears.
 *
 * Finding out took the same shape every time: change something, deploy, build a
 * whole campaign, wait, watch it fail, read the deployment logs, guess again.
 * Each of those loops cost twenty minutes and some provider credit. Every step
 * in it can be checked directly in about a second, which is what this does.
 *
 * The steps are shown in the order the real path runs them, and the first
 * failure is the answer — everything after it is marked skipped rather than
 * guessed at, because a storage result means nothing when nothing was drawn.
 */

const ICON: Record<GenerationTest['steps'][number]['status'], 'check-circle' | 'x' | 'circle'> = {
  pass: 'check-circle',
  fail: 'x',
  skip: 'circle',
}

export function GenerationSelfTest() {
  const [result, setResult] = useState<GenerationTest | null>(null)
  const [running, setRunning] = useState<'checks' | 'draw' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /**
   * The direction-preview run, which lives here because it answers the same
   * question the self-test does — does image generation work — and because it is
   * the other thing an operator presses once after a deploy.
   */
  const [previews, setPreviews] = useState<DirectionPreviewRun | null>(null)
  const [drawing, setDrawing] = useState(false)

  async function makePreviews() {
    setDrawing(true)
    setError(null)
    try {
      setPreviews(await platform.generateDirectionPreviews(false))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The previews could not be generated')
    } finally {
      setDrawing(false)
    }
  }

  async function run(draw: boolean) {
    setRunning(draw ? 'draw' : 'checks')
    setError(null)
    try {
      setResult(await platform.generationTest(draw))
    } catch (e) {
      // Same reasoning as the diagnostics panel: a 404 here is itself the
      // finding — the deployed API is older than this bundle.
      if (e instanceof ApiError && e.status === 404) {
        setError(
          'The deployed API does not have this endpoint yet — it is older than this frontend build. Deploy the API.',
        )
      } else {
        setError(e instanceof ApiError ? e.message : 'The self-test could not be run')
      }
    } finally {
      setRunning(null)
    }
  }

  const failed = result?.steps.filter((s) => s.status === 'fail') ?? []

  return (
    <div className="card diag">
      <div className="diag__head">
        Generation self-test
        {result ? (
          <span className="diag__env" data-state={result.ok ? 'ok' : 'off'}>
            {result.ok ? 'working' : `${String(failed.length)} failing`}
          </span>
        ) : null}
      </div>

      <p className="diag__note" style={{ marginTop: 0 }}>
        Walks the real path — key, model, drawing, storage — and says which step breaks. Replaces
        building a campaign to find out.
      </p>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '2px 0 12px' }}>
        <button
          type="button"
          className="btn primary sm"
          disabled={running !== null}
          onClick={() => void run(false)}
        >
          {running === 'checks' ? <Spinner /> : <Icon name="zap" size={14} />}
          Run checks
        </button>
        {/* Separated deliberately: this one bills the account for an image and
            writes an object. Most failures are found by the free checks, so the
            expensive one is never the default. */}
        <button
          type="button"
          className="btn sm"
          disabled={running !== null}
          onClick={() => void run(true)}
        >
          {running === 'draw' ? <Spinner /> : <Icon name="image" size={14} />}
          Run checks and draw a test picture
        </button>
      </div>

      {error ? (
        <div className="diag-row" data-state="warn">
          <Icon name="alert-triangle" size={15} />
          <span className="diag-row__label">Self-test</span>
          <span className="diag-row__detail">{error}</span>
        </div>
      ) : null}

      {result
        ? result.steps.map((step) => (
            <div
              key={step.id}
              className="diag-row"
              data-state={step.status === 'pass' ? 'ok' : step.status === 'fail' ? 'warn' : 'off'}
              style={{ alignItems: 'flex-start' }}
            >
              <Icon name={ICON[step.status]} size={15} />
              <span className="diag-row__label">{step.label}</span>
              <span className="diag-row__detail">{step.detail}</span>
              <span className="diag-row__state">{step.status}</span>
            </div>
          ))
        : null}

      {/* The other one-press operator job. Separate button, because it bills
          for one image per AI direction — and it skips what already exists, so
          pressing it after a deploy costs nothing. */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '14px 0 0' }}>
        <button
          type="button"
          className="btn sm"
          disabled={drawing}
          onClick={() => void makePreviews()}
        >
          {drawing ? <Spinner /> : <Icon name="images" size={14} />}
          Generate the direction previews
        </button>
        {previews ? (
          <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
            {previews.made.length} drawn · {previews.skipped.length} already had one
            {previews.failed.length > 0 ? ` · ${String(previews.failed.length)} failed` : ''}
          </span>
        ) : null}
      </div>
      {previews?.failed.map((f) => (
        <div key={f.id} className="diag-row" data-state="warn" style={{ alignItems: 'flex-start' }}>
          <Icon name="x" size={15} />
          <span className="diag-row__label">{f.id}</span>
          <span className="diag-row__detail">{f.reason}</span>
        </div>
      ))}

      {result ? (
        <p className="diag__note">
          Ran {new Date(result.ranAt).toLocaleTimeString()}
          {result.drew ? ' · one image was generated and stored' : ' · nothing was generated'}. No
          key or secret is returned by this endpoint.
        </p>
      ) : null}
    </div>
  )
}
