'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { StatusPill, toStatus } from '@/components/status'
import { Spinner } from '@/components/ui'
import { CAMPAIGN_SECTION, SectionNav } from '@/components/section-nav'
import { ReviewQueue } from '@/components/review-queue'
import { PostComposer } from '@/components/post-composer'
import { downloadUrl, extensionFromUrl, safeFilename } from '@/lib/download'

/**
 * Batch generation and review.
 *
 * "Generate all" over a fifty-product campaign returns immediately with a batch
 * id and this page polls the progress — the request never waits on rendering.
 * Posters appear as they land rather than all at the end, because watching
 * twelve of fifty arrive is the difference between a system that feels like it
 * is working and one that feels hung.
 */

interface Campaign {
  id: string
  name: string
}

interface Creative {
  id: string
  status: string
  renderedUrl: string | null
  templateSlug: string
  aspectRatio: string
  failureReason: string | null
  product: { name: string; brand: string | null } | null
}

interface Batch {
  id: string
  total: number
  completed: number
  failed: number
  status: string
  percent: number
}

interface DesignTemplate {
  slug: string
  name: string
}

interface Product {
  id: string
  name: string
  brand: string | null
  imageUrl: string | null
}

/**
 * Statuses that count as "waiting on a person".
 *
 * The sidebar's Review queue is this page with `?status=needs_review` — a
 * filtered view rather than a second route, so there is one place creatives are
 * approved and no chance of the two drifting apart. READY means rendered and
 * unjudged; DRAFT means queued or mid-render and still nobody's decision.
 */
const NEEDS_REVIEW = new Set(['READY', 'DRAFT'])

export default function CreativesPage() {
  const toast = useToast()
  const searchParams = useSearchParams()
  const needsReviewOnly = searchParams.get('status') === 'needs_review'
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [campaignId, setCampaignId] = useState<string>('')
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [template, setTemplate] = useState('tricolour')
  const [creatives, setCreatives] = useState<Creative[] | null>(null)
  const [batch, setBatch] = useState<Batch | null>(null)
  /**
   * The optional scene prompt.
   *
   * Empty means the poster is pure template — the product photograph on the
   * template's own background, which costs nothing and renders in milliseconds.
   * Filled means one AI background is generated first and every poster in the
   * batch is composed on top of it, so a run is one generation rather than one
   * per product.
   */
  const [prompt, setPrompt] = useState('')
  const [posting, setPosting] = useState<Creative | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // The catalogue, and which of it this campaign generates from.
  const [catalogue, setCatalogue] = useState<Product[] | null>(null)
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [savingProducts, setSavingProducts] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<{ data: Campaign[] } | Campaign[]>('/campaigns').catch(() => ({ data: [] })),
      api.get<{ data: DesignTemplate[] }>('/design-templates').catch(() => ({ data: [] })),
      api.get<{ data: Product[] }>('/products').catch(() => ({ data: [] })),
    ]).then(([c, t, pr]) => {
      const list = Array.isArray(c) ? c : (c.data ?? [])
      setCampaigns(list)
      setCampaignId((current) => current || (list[0]?.id ?? ''))
      setTemplates(t.data ?? [])
      setCatalogue(pr.data ?? [])
    })
  }, [])

  // Membership belongs to the campaign, so it reloads when the campaign changes.
  useEffect(() => {
    if (!campaignId) return
    let stale = false
    api
      .get<{ productIds: string[] }>(`/campaigns/${campaignId}/products`)
      .then((r) => {
        if (!stale) setAttached(new Set(r.productIds))
      })
      .catch(() => {
        if (!stale) setAttached(new Set())
      })
    return () => {
      stale = true
    }
  }, [campaignId])

  /**
   * Toggling saves immediately, and puts the tick back if the save fails.
   *
   * The alternative — a Save button — adds a step between "these are my
   * products" and "generate", which is exactly where someone clicks Generate
   * all, gets "this campaign has no products", and concludes the feature is
   * broken. The write is a full-set replace, so it is safe to repeat.
   */
  async function toggleProduct(id: string) {
    const next = new Set(attached)
    if (next.has(id)) next.delete(id)
    else next.add(id)

    const previous = attached
    setAttached(next)
    setSavingProducts(true)
    try {
      await api.put(`/campaigns/${campaignId}/products`, { productIds: [...next] })
    } catch (e) {
      setAttached(previous)
      toast.push('error', e instanceof ApiError ? e.message : 'Could not update the product list')
    } finally {
      setSavingProducts(false)
    }
  }

  const loadCreatives = useCallback(() => {
    if (!campaignId) return
    setError(null)
    api
      .get<{ data: Creative[] }>(`/creatives?campaignId=${campaignId}`)
      .then((r) => setCreatives(r.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load creatives'),
      )
  }, [campaignId])

  useEffect(() => {
    setCreatives(null)
    setSelected(new Set())
    loadCreatives()
  }, [loadCreatives])

  /**
   * How long this batch has been running without a single item landing.
   *
   * A render takes about a second, so nothing moving for the best part of a
   * minute does not mean "be patient" — it means no worker picked the job up.
   * Sitting at 0% indefinitely with a hopeful label is the same failure as a
   * spinner that never resolves: the screen keeps promising while nothing is
   * happening. After the threshold it says so instead.
   */
  const [stalledSince, setStalledSince] = useState<number | null>(null)
  const stalled =
    batch?.status === 'RUNNING' &&
    batch.completed + batch.failed === 0 &&
    stalledSince !== null &&
    Date.now() - stalledSince > 45_000

  // Poll while a batch is running. Stops the moment it finishes — a poll that
  // outlives its batch is a request every two seconds forever.
  useEffect(() => {
    if (!batch || batch.status !== 'RUNNING') return
    const t = window.setInterval(() => {
      api
        .get<Batch>(`/batches/${batch.id}`)
        .then((next) => {
          setBatch(next)
          // Any movement at all means a worker is consuming; stop watching.
          if (next.completed + next.failed > 0) setStalledSince(null)
          loadCreatives()
          if (next.status !== 'RUNNING') {
            toast.push(
              next.failed > 0 ? 'error' : 'success',
              next.failed > 0
                ? `${String(next.completed)} rendered, ${String(next.failed)} failed`
                : `${String(next.completed)} creatives ready`,
            )
          }
        })
        .catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(t)
  }, [batch, loadCreatives, toast])

  async function generateAll() {
    if (!campaignId) return
    setBusy(true)
    try {
      // One scene for the whole batch, generated first so every product in this
      // run shares a background. Asking for one variant rather than three: this
      // is a "generate now" button, not a scene chooser, and two extra images
      // nobody looks at still cost two generations.
      let sceneId: string | null = null
      const theme = prompt.trim()
      if (theme) {
        const scenes = await api.post<{ data: { id: string }[] }>('/scenes', {
          campaignId,
          theme,
          ratio: '1:1',
          variants: 1,
        })
        sceneId = scenes.data[0]?.id ?? null
        if (!sceneId) {
          toast.push('error', 'The background could not be generated — nothing was charged twice')
          return
        }
      }

      const res = await api.post<{ batchId: string; total: number }>(
        `/campaigns/${campaignId}/creatives/batch`,
        { template, ratio: '1:1', ...(sceneId ? { sceneId } : {}) },
      )
      setBatch({
        id: res.batchId,
        total: res.total,
        completed: 0,
        failed: 0,
        status: 'RUNNING',
        percent: 0,
      })
      setStalledSince(Date.now())
      toast.push('success', `Generating ${String(res.total)} creatives`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not start generation')
    } finally {
      setBusy(false)
    }
  }

  async function bulk(action: 'approve' | 'reject') {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await api.post<{ updated: number }>('/creatives/bulk', {
        action,
        ids: [...selected],
      })
      toast.push('success', `${String(res.updated)} ${action}d`)
      setSelected(new Set())
      loadCreatives()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `Could not ${action}`)
    } finally {
      setBusy(false)
    }
  }

  /** The rendered poster is a bucket url, so no credentials — see lib/download. */
  async function downloadCreative(c: Creative) {
    if (!c.renderedUrl) return
    setDownloadingId(c.id)
    try {
      await downloadUrl(
        c.renderedUrl,
        safeFilename(
          [c.product?.brand, c.product?.name, c.templateSlug],
          extensionFromUrl(c.renderedUrl),
        ),
      )
      toast.push('success', 'Saved')
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'Could not download the poster')
    } finally {
      setDownloadingId(null)
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visible = useMemo(
    () =>
      needsReviewOnly ? (creatives ?? []).filter((c) => NEEDS_REVIEW.has(c.status)) : creatives,
    [creatives, needsReviewOnly],
  )
  const ready = (visible ?? []).filter((c) => c.renderedUrl)

  // `?status=needs_review` is the sidebar's Review queue. It is the same route
  // deliberately: one approval surface, reached either as a filter of the
  // library or as its own destination, so the badge and the screen can never
  // count different things.
  if (needsReviewOnly) {
    return (
      <>
        <SectionNav links={CAMPAIGN_SECTION} />
        <ReviewQueue />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Creatives" />
      <SectionNav links={CAMPAIGN_SECTION} />

      <FadeIn className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <label className="type-label" style={{ display: 'block', marginBottom: 4 }}>
              Campaign
            </label>
            <select
              className="input"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 200 }}>
            <label className="type-label" style={{ display: 'block', marginBottom: 4 }}>
              Template
            </label>
            <select
              className="input"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn primary"
            disabled={busy || !campaignId || attached.size === 0 || batch?.status === 'RUNNING'}
            onClick={() => void generateAll()}
          >
            {busy ? <Spinner /> : <Icon name="sparkles" size={14} />} Generate all
            {attached.size > 0 ? ` (${String(attached.size)})` : ''}
          </button>
        </div>

        {/* The scene prompt.
            Optional on purpose, and labelled so that the cost is visible before
            the click: empty is the free path, filled spends one generation for
            the whole batch. It sits above the products because it applies to all
            of them. */}
        <div style={{ marginTop: 16 }}>
          <label className="type-label" style={{ display: 'block', marginBottom: 4 }}>
            Background prompt <span className="type-caption">— optional</span>
          </label>
          <input
            className="input"
            value={prompt}
            placeholder="A sunlit marble café table with soft morning shadows"
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="type-caption" style={{ margin: '6px 0 0', color: 'var(--text-tertiary)' }}>
            {prompt.trim()
              ? 'One background is generated and every poster in this run is composed on top of it. The product photograph and the prices are laid on afterwards, so no text is invented.'
              : 'Leave this empty and the posters use the template’s own background — instant, and nothing is generated.'}
          </p>
        </div>

        {/* Which products this campaign generates from. Without this the batch
            endpoint can only answer "no products", which reads as a bug. */}
        <div style={{ marginTop: 16 }}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <label className="type-label">Products in this campaign</label>
            <span className="type-caption">
              {savingProducts ? 'Saving…' : `${String(attached.size)} selected`}
            </span>
          </div>

          {catalogue === null ? (
            <Spinner />
          ) : catalogue.length === 0 ? (
            <p className="type-caption">
              No products yet — add them under <a href="/app/products">Products</a> first.
            </p>
          ) : (
            <div className="product-picker">
              {catalogue.map((p) => {
                const on = attached.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`product-picker__item${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    disabled={savingProducts}
                    onClick={() => void toggleProduct(p.id)}
                  >
                    <Icon name={on ? 'check' : 'plus'} size={13} />
                    <span className="product-picker__name">{p.name}</span>
                    {p.brand ? <span className="type-caption">{p.brand}</span> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {batch ? (
          <div style={{ marginTop: 16 }}>
            <div className="spread" style={{ marginBottom: 6 }}>
              <span className="type-caption">
                {batch.status === 'RUNNING' ? 'Generating…' : 'Finished'} ·{' '}
                {batch.completed + batch.failed} / {batch.total}
                {batch.failed > 0 ? ` · ${String(batch.failed)} failed` : ''}
              </span>
              <span className="type-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {batch.percent}%
              </span>
            </div>
            <div className="batch-bar">
              <div className="batch-bar__fill" style={{ width: `${String(batch.percent)}%` }} />
            </div>
            {stalled ? (
              <p className="type-caption" style={{ margin: '8px 0 0', color: 'var(--amber-600)' }}>
                Nothing has started after 45 seconds. The posters are queued but no worker has
                picked them up — the render service is down or pointed at a different queue. The
                rows are safe; they render as soon as it is back.
              </p>
            ) : null}
          </div>
        ) : null}
      </FadeIn>

      {selected.size > 0 ? (
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <span className="type-caption">{selected.size} selected</span>
          <button
            type="button"
            className="btn sm primary"
            disabled={busy}
            onClick={() => void bulk('approve')}
          >
            <Icon name="check" size={13} /> Approve
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={() => void bulk('reject')}
          >
            <Icon name="x" size={13} /> Reject
          </button>
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={loadCreatives} />
      ) : visible === null ? (
        <div className="row" style={{ gap: 8, padding: 24 }}>
          <Spinner />
          <span className="type-secondary">Loading creatives…</span>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="image"
          title={
            needsReviewOnly ? 'Nothing is waiting on you' : 'No creatives for this campaign yet'
          }
          hint={
            needsReviewOnly
              ? 'Every creative in this campaign has been approved or rejected.'
              : attached.size === 0
                ? 'Tick the products above to add them to this campaign, then Generate all.'
                : `${String(attached.size)} product${attached.size === 1 ? '' : 's'} ready — press Generate all. Each poster renders in about a second.`
          }
        />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}
        >
          {visible.map((c) => (
            <div
              key={c.id}
              className={`card creative-tile${selected.has(c.id) ? ' is-selected' : ''}`}
              style={{ padding: 10 }}
            >
              <button
                type="button"
                className="creative-tile__hit"
                aria-pressed={selected.has(c.id)}
                onClick={() => c.renderedUrl && toggle(c.id)}
                disabled={!c.renderedUrl}
              >
                {c.renderedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.renderedUrl} alt={c.product?.name ?? 'Creative'} loading="lazy" />
                ) : (
                  /* A spinner is a promise that something is happening. Only
                     RENDERING is actually happening — a DRAFT row is a creative
                     that was never sent to render, and it spun forever, which
                     reads as "the system is slow" instead of "press Generate".
                     The status pill below already says DRAFT; the tile agrees
                     with it now. */
                  <div className="creative-tile__pending">
                    {c.status === 'FAILED' ? (
                      <Icon name="alert-triangle" size={20} />
                    ) : c.status === 'RENDERING' ? (
                      <Spinner />
                    ) : (
                      <>
                        <Icon name="image" size={20} />
                        <span className="type-caption">Not rendered yet</span>
                      </>
                    )}
                  </div>
                )}
              </button>

              <div className="spread" style={{ marginTop: 10, gap: 8 }}>
                <StatusPill status={toStatus(c.status)} />
                <span className="dim" style={{ fontSize: 11 }}>
                  {c.templateSlug}
                </span>
              </div>
              <p
                className="type-caption"
                style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}
              >
                {c.product?.name ?? 'Untitled'}
              </p>
              {c.failureReason ? (
                <p
                  className="type-caption"
                  style={{ margin: '4px 0 0', color: 'var(--text-tertiary)' }}
                >
                  {c.failureReason}
                </p>
              ) : null}

              {/* Download and Post appear only on a poster that exists. An
                  action offered on an unrendered tile can only fail. */}
              {c.renderedUrl ? (
                <div className="row" style={{ gap: 6, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={downloadingId === c.id}
                    onClick={() => void downloadCreative(c)}
                  >
                    {downloadingId === c.id ? <Spinner /> : <Icon name="download" size={13} />}{' '}
                    Download
                  </button>
                  <button type="button" className="btn sm" onClick={() => setPosting(c)}>
                    <Icon name="send" size={13} /> Post
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {ready.length > 0 ? (
        <p className="type-caption" style={{ color: 'var(--text-tertiary)', marginTop: 16 }}>
          Editing a price or coupon re-renders in about a second and costs nothing — only the
          background is ever generated.
        </p>
      ) : null}

      {/* Registering the media happens on Post, not on render: a poster nobody
          publishes should not leave a row behind. */}
      {posting ? (
        <PostComposer
          open
          subject={posting.product?.name ?? 'Poster'}
          initialCaption={posting.product?.name ?? ''}
          resolveMedia={async () => {
            const res = await api.post<{ mediaId: string; url: string }>(
              `/creatives/${posting.id}/media`,
              {},
            )
            return { mediaId: res.mediaId, url: res.url }
          }}
          onClose={() => setPosting(null)}
          onPosted={loadCreatives}
        />
      ) : null}
    </>
  )
}
