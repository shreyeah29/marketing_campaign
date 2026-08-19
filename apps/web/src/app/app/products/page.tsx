'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ApiError, api, apiUpload } from '@/lib/api'
import { downloadUrl, safeFilename } from '@/lib/download'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Field, Spinner } from '@/components/ui'
import { PostComposer } from '@/components/post-composer'

/**
 * The product catalogue.
 *
 * Prices are entered in rupees and held in paise. The conversion happens in one
 * place, on the way in and on the way out, because a price that drifts here is a
 * price that gets typeset onto an advertisement.
 *
 * Every row previews live: the poster beside a product is rendered on demand
 * from the template engine, costs nothing, and updates the moment a price
 * changes. That is the whole argument for separating the AI visual from the
 * composed creative, made visible.
 */

interface Product {
  id: string
  name: string
  brand: string | null
  sku: string | null
  mrpMinor: number | null
  salePriceMinor: number | null
  currency: string
  imageUrl: string | null
  discountPercent: number | null
}

/** Rupees ↔ paise, in one place. */
const toMinor = (major: string): number | null => {
  const n = Number.parseFloat(major.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
const toMajor = (minor: number | null): string => (minor == null ? '' : String(minor / 100))

const money = (minor: number | null, currency: string): string => {
  if (minor == null) return '—'
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' }
  return `${symbols[currency] ?? currency}${(minor / 100).toLocaleString('en-IN')}`
}

interface DesignTemplate {
  slug: string
  name: string
}

interface Draft {
  name: string
  brand: string
  sku: string
  mrp: string
  salePrice: string
  imageUrl: string
}

const EMPTY: Draft = { name: '', brand: '', sku: '', mrp: '', salePrice: '', imageUrl: '' }

/** The ratios the render endpoint accepts, with what each is for. */
const RATIOS: readonly (readonly [string, string])[] = [
  ['1:1', 'Feed'],
  ['4:5', 'Portrait'],
  ['9:16', 'Story'],
  ['16:9', 'Wide'],
]

/**
 * Wrapped because the layout below reads the query string, and a direction card
 * on the brief screen arrives here as `?template=pair` — the slug it promised.
 * `useSearchParams` needs a Suspense boundary in the App Router.
 */
export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsInner />
    </Suspense>
  )
}

function ProductsInner() {
  const toast = useToast()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // The template every row previews through. One choice for the whole page:
  // the question being asked is "which layout suits this catalogue", and
  // answering it per row would make the rows incomparable.
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [template, setTemplate] = useState('tricolour')
  const search = useSearchParams()

  /**
   * The layout a creative direction sent us here to use.
   *
   * A promotional direction on the brief screen promises "typeset — text always
   * correct", and that promise is only kept by the render path, which lives
   * here. Landing on the catalogue with a different layout selected than the one
   * on the card someone just clicked would quietly break it.
   *
   * Applied once, from the URL, so choosing another template on this page is not
   * undone by a re-render.
   */
  const applied = useRef(false)
  useEffect(() => {
    if (applied.current) return
    const wanted = search.get('template')
    if (!wanted) return
    applied.current = true
    setTemplate(wanted)
  }, [search])

  /**
   * The product direction that sent us here — "Dramatic light", "Luxury marble".
   *
   * Different in kind from `?template=` above, and conflating them was the bug.
   * A template is a layout the engine typesets around a product's existing
   * photograph; a direction is a *world the product is photographed in*, which
   * means generating a new picture. Picking "Dramatic light" and landing on a
   * page of template chips looked like the choice had been thrown away, because
   * it had.
   */
  const directionId = search.get('direction')
  const [directions, setDirections] = useState<
    { id: string; name: string; blurb: string; group: string }[]
  >([])
  const direction = directions.find((d) => d.id === directionId) ?? null
  /**
   * Which product is being staged, and the newest picture for each.
   *
   * Loaded from the API rather than held only in this component: a generated
   * picture that disappears on refresh is a picture someone paid for and then
   * lost. The bytes were always durable — nothing listed them, so they were
   * invisible after the tab that made them closed.
   */
  const [staging, setStaging] = useState<string | null>(null)
  const [staged, setStaged] = useState<Record<string, { id: string; url: string }>>({})
  const [keeping, setKeeping] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())

  useEffect(() => {
    api
      .get<{ data: { id: string; url: string; productId: string | null }[] }>('/media?kind=shot')
      .then((r) => {
        // Newest first from the API, so the first of each product wins.
        const byProduct: Record<string, { id: string; url: string }> = {}
        for (const row of r.data ?? []) {
          if (row.productId && !byProduct[row.productId]) {
            byProduct[row.productId] = { id: row.id, url: row.url }
          }
        }
        setStaged(byProduct)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!directionId) return
    api
      .get<{ data: { id: string; name: string; blurb: string; group: string }[] }>(
        '/creative-directions',
      )
      .then((r) => setDirections((r.data ?? []).filter((d) => d.group === 'product')))
      .catch(() => setDirections([]))
  }, [directionId])

  /**
   * Photograph one product in the chosen world.
   *
   * The direction travels as an id and is resolved to art direction server-side,
   * so the catalogue stays one list and the look never crosses the wire as text.
   *
   * The product's own uploaded photograph is the reference, and the shot prompt
   * demands its shape and colour stay faithful — this changes the room, not the
   * product. A product with no photograph is refused by the API rather than
   * invented, and that message is worth showing verbatim.
   */
  /**
   * Put a generated picture in the library.
   *
   * `/media` is everything ever made — a working drawer. Keeping promotes one
   * into the reviewed library beside approved campaign work, which is the shelf
   * things get published from. Idempotent server-side, so a double click does
   * not produce two copies.
   */
  async function keep(product: Product) {
    const shot = staged[product.id]
    if (!shot || keeping) return
    setKeeping(product.id)
    try {
      await api.post(`/media/${shot.id}/keep`, {
        title: `${product.name} — ${direction?.name ?? 'generated'}`,
      })
      setKept((prev) => new Set(prev).add(product.id))
      toast.push('success', 'Saved to Images & video')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save that picture')
    } finally {
      setKeeping(null)
    }
  }

  async function stage(product: Product) {
    if (!directionId || staging) return
    setStaging(product.id)
    try {
      const res = await api.post<{ mediaId: string; url: string }>('/scenes/shot', {
        productId: product.id,
        ratio: '1:1',
        directionId,
      })
      setStaged((prev) => ({ ...prev, [product.id]: { id: res.mediaId, url: res.url } }))
      toast.push('success', `${product.name} photographed in ${direction?.name ?? 'that style'}`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'That picture could not be generated')
    } finally {
      setStaging(null)
    }
  }
  const fileRef = useRef<HTMLInputElement>(null)

  // The poster drawer: one product, viewed large, at a ratio of its own. The
  // list's template choice carries in as the starting point, and the drawer can
  // change both without disturbing the page behind it.
  const [poster, setPoster] = useState<Product | null>(null)
  const [posterRatio, setPosterRatio] = useState('1:1')
  const [posterTemplate, setPosterTemplate] = useState('tricolour')
  const [downloading, setDownloading] = useState(false)
  const [posting, setPosting] = useState<Product | null>(null)

  /** The render endpoint, for a given product, template and ratio. */
  /**
   * The render endpoint for one product, template and ratio.
   *
   * `sceneId` is what makes a staged picture actually appear on the poster. The
   * drawer was rendering the product's *original* photograph — correct before
   * anything was generated, and plainly wrong the moment someone had just
   * watched a new one appear in the row beside it.
   *
   * The API drops the product cutout when the scene is a shot, because a shot
   * already contains the product and compositing it again draws the bottle
   * twice, lit two different ways.
   */
  const previewSrc = useCallback(
    (id: string, ratio: string, slug: string, sceneId?: string) =>
      `${api.base}/products/${id}/preview?ratio=${encodeURIComponent(ratio)}&template=${encodeURIComponent(slug)}` +
      (sceneId ? `&sceneId=${encodeURIComponent(sceneId)}` : ''),
    [],
  )

  /**
   * Download the poster.
   *
   * Fetched with credentials rather than linked: the render requires the session
   * cookie, and an anchor would send none and save a 401 body as a .png. See
   * lib/download.ts.
   */
  /**
   * Every size in one press.
   *
   * A template render is the one path where this is genuinely free: the layout
   * is recomposed at each shape, so a story and a square are the same design
   * rather than two generations. An AI picture cannot do this — it would have to
   * be drawn again and would come back different — which is why the button only
   * exists here.
   *
   * Sequential, because four concurrent renders of the same product is four
   * times the work for no wall-clock gain worth the failure risk.
   */
  async function downloadAllSizes(product: Product, slug: string) {
    setDownloading(true)
    try {
      for (const [ratio] of RATIOS) {
        await downloadUrl(
          // The staged scene travels with the download. Without it the file
          // saved is a different picture from the one on screen, which is the
          // worst kind of wrong: it looks like it worked.
          previewSrc(product.id, ratio, slug, staged[product.id]?.id),
          safeFilename([product.brand, product.name, slug, ratio.replace(':', 'x')], 'png'),
          { withCredentials: true },
        )
      }
      toast.push('success', `Saved ${String(RATIOS.length)} sizes`)
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'Could not download every size')
    } finally {
      setDownloading(false)
    }
  }

  async function download(product: Product, ratio: string, slug: string) {
    setDownloading(true)
    try {
      await downloadUrl(
        previewSrc(product.id, ratio, slug, staged[product.id]?.id),
        safeFilename([product.brand, product.name, slug, ratio.replace(':', 'x')], 'png'),
        { withCredentials: true },
      )
      toast.push('success', 'Saved')
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : 'Could not download the poster')
    } finally {
      setDownloading(false)
    }
  }

  /**
   * Store the poster and hand back its media id.
   *
   * Posting needs a file Instagram's servers can fetch, and the preview endpoint
   * returns bytes without keeping them. This renders the same poster and keeps
   * it — once per product, template and ratio, because the endpoint reuses an
   * identical render rather than filling the bucket.
   */
  const storePoster = useCallback(async (product: Product, ratio: string, slug: string) => {
    const res = await api.post<{ mediaId: string; url: string }>(`/products/${product.id}/render`, {
      ratio,
      template: slug,
    })
    return { mediaId: res.mediaId, url: res.url }
  }, [])

  const load = useCallback(() => {
    setError(null)
    api
      .get<{ data: Product[] }>('/products')
      .then((r) => setProducts(r.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load your products'),
      )
  }, [])

  useEffect(() => load(), [load])

  useEffect(() => {
    api
      .get<{ data: DesignTemplate[] }>('/design-templates')
      .then((r) => setTemplates(r.data ?? []))
      // A gallery that will not load is not a reason to hide the catalogue —
      // the preview simply falls back to the default template.
      .catch(() => undefined)
  }, [])

  async function pickImage(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await apiUpload<{ url: string }>('/uploads', body)
      setDraft((d) => ({ ...(d ?? EMPTY), imageUrl: res.url }))
      toast.push('success', 'Image uploaded')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) {
      toast.push('error', 'Give the product a name')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: draft.name.trim(),
        brand: draft.brand.trim() || null,
        sku: draft.sku.trim() || null,
        mrpMinor: draft.mrp ? toMinor(draft.mrp) : null,
        salePriceMinor: draft.salePrice ? toMinor(draft.salePrice) : null,
        imageUrl: draft.imageUrl || null,
      }
      if (editingId) await api.patch(`/products/${editingId}`, body)
      else await api.post('/products', { ...body, currency: 'INR' })
      toast.push('success', editingId ? 'Product updated' : 'Product added')
      setDraft(null)
      setEditingId(null)
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save the product')
    } finally {
      setSaving(false)
    }
  }

  async function remove(p: Product) {
    try {
      await api.del(`/products/${p.id}`)
      toast.push('success', 'Product removed')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not remove it')
    }
  }

  function edit(p: Product) {
    setEditingId(p.id)
    setDraft({
      name: p.name,
      brand: p.brand ?? '',
      sku: p.sku ?? '',
      mrp: toMajor(p.mrpMinor),
      salePrice: toMajor(p.salePriceMinor),
      imageUrl: p.imageUrl ?? '',
    })
  }

  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setEditingId(null)
              setDraft(EMPTY)
            }}
          >
            <Icon name="plus" size={14} /> Add product
          </button>
        }
      />

      {/* The chosen world, named. Landing here with a page of template chips
          and no mention of "Dramatic light" is what made the choice look
          discarded — and the two are different things, so the banner says which
          one is in play. */}
      {direction ? (
        <div className="banner" style={{ marginBottom: 16 }}>
          <Icon name="sparkles" size={15} />
          <span>
            <strong>{direction.name}</strong> — {direction.blurb} Press{' '}
            <strong>Photograph in this style</strong> on a product to generate it. Its own picture
            stays the product; only the surroundings change.
          </span>
        </div>
      ) : null}

      {templates.length > 0 && products && products.length > 0 ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span className="type-caption" style={{ color: 'var(--text-tertiary)' }}>
            Preview as
          </span>
          {templates.map((t) => (
            <button
              key={t.slug}
              type="button"
              className={`chip ${template === t.slug ? 'on' : ''}`}
              onClick={() => setTemplate(t.slug)}
            >
              {t.name}
            </button>
          ))}
        </div>
      ) : null}

      {draft ? (
        <FadeIn className="card" style={{ maxWidth: 720, marginBottom: 20 }}>
          <h2 className="type-section" style={{ marginBottom: 16 }}>
            {editingId ? 'Edit product' : 'New product'}
          </h2>

          <Field label="Product name">
            <input
              className="input"
              value={draft.name}
              placeholder="Anua 10+ Niacinamide Serum"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>

          <div className="cols-2 grid">
            <Field label="Brand">
              <input
                className="input"
                value={draft.brand}
                placeholder="Anua"
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              />
            </Field>
            <Field label="SKU">
              <input
                className="input"
                value={draft.sku}
                placeholder="ANU-NIA-30"
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              />
            </Field>
            <Field label="MRP (₹)" hint="The struck-through price.">
              <input
                className="input"
                inputMode="decimal"
                value={draft.mrp}
                placeholder="2200"
                onChange={(e) => setDraft({ ...draft, mrp: e.target.value })}
              />
            </Field>
            <Field label="Sale price (₹)" hint="The discount is worked out from these two.">
              <input
                className="input"
                inputMode="decimal"
                value={draft.salePrice}
                placeholder="1870"
                onChange={(e) => setDraft({ ...draft, salePrice: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label="Product photo"
            hint="A PNG with a transparent background sits best on a poster."
          >
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickImage(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Spinner /> : <Icon name="upload" size={14} />}
                {draft.imageUrl ? 'Replace image' : 'Upload image'}
              </button>
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUrl}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'var(--surface-sunken)',
                  }}
                />
              ) : null}
            </div>
          </Field>

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Spinner /> : <Icon name="check" size={14} />}
              {editingId ? 'Save changes' : 'Add product'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setDraft(null)
                setEditingId(null)
              }}
            >
              Cancel
            </button>
          </div>
        </FadeIn>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : products === null ? (
        <TableSkeleton cols={4} />
      ) : products.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No products yet"
          hint="Add a product and its poster renders instantly — no AI, no waiting."
        />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {products.map((p) => (
            <FadeIn key={p.id} className="card product-row">
              {/* The live preview. A plain <img> because the endpoint is a GET
                  that returns a PNG — no client-side rendering, no drift from
                  what the server will actually produce.

                  `crossOrigin="use-credentials"` is what makes it load at all.
                  The API is a different origin from the app, and a bare <img>
                  sends no cookies cross-origin, so the request arrived
                  unauthenticated and the route — which requires CONTENT_READ —
                  answered 401. The browser reports that as nothing more than a
                  broken image, which is why every row showed alt text. */}
              {/* Once a product has been photographed in the chosen world, that
                  is what the row shows. A template preview beside a picture that
                  was just generated would be the old answer sitting where the
                  new one belongs. Bucket URL, so no `crossOrigin` — the opposite
                  of the render endpoint directly below it. */}
              {staged[p.id] ? (
                /* Clickable, because otherwise the picture has nowhere to go.
                   The media library lists campaign assets and creatives, not
                   the shots this produces, so without a download here a person
                   would generate something and be unable to keep it. */
                <button
                  type="button"
                  className="product-row__preview"
                  style={{ border: 0, padding: 0, cursor: 'zoom-in', overflow: 'hidden' }}
                  title="Download this picture"
                  onClick={() => {
                    const shot = staged[p.id]
                    if (!shot) return
                    void downloadUrl(
                      shot.url,
                      safeFilename([p.brand, p.name, direction?.name ?? 'styled'], 'png'),
                    ).catch(() => toast.push('error', 'Could not download that picture'))
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={staged[p.id]?.url}
                    alt={`${p.name} in ${direction?.name ?? 'the chosen style'}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                </button>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="product-row__preview"
                  src={`${api.base}/products/${p.id}/preview?ratio=1:1&template=${template}`}
                  alt={`Poster preview for ${p.name}`}
                  crossOrigin="use-credentials"
                  loading="lazy"
                />
              )}

              <div style={{ minWidth: 0 }}>
                {p.brand ? (
                  <p className="type-label" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
                    {p.brand}
                  </p>
                ) : null}
                <p className="type-body-strong" style={{ margin: '2px 0 6px' }}>
                  {p.name}
                </p>
                <p className="type-secondary" style={{ margin: 0 }}>
                  <strong>{money(p.salePriceMinor, p.currency)}</strong>
                  {p.mrpMinor != null && p.mrpMinor !== p.salePriceMinor ? (
                    <span
                      style={{
                        textDecoration: 'line-through',
                        opacity: 0.6,
                        marginLeft: 8,
                      }}
                    >
                      {money(p.mrpMinor, p.currency)}
                    </span>
                  ) : null}
                  {p.discountPercent != null ? (
                    <span style={{ marginLeft: 8 }}>· {p.discountPercent}% off</span>
                  ) : null}
                </p>
              </div>

              <div className="row" style={{ gap: 6 }}>
                {/* First when a direction is in play, because it is why someone
                    is on this page: they picked a look two screens ago and came
                    here to apply it. */}
                {direction ? (
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={staging !== null}
                    onClick={() => void stage(p)}
                  >
                    {staging === p.id ? (
                      <Spinner />
                    ) : (
                      <Icon name={staged[p.id] ? 'refresh' : 'sparkles'} size={13} />
                    )}
                    {staging === p.id
                      ? 'Photographing…'
                      : staged[p.id]
                        ? 'Again'
                        : 'Photograph in this style'}
                  </button>
                ) : null}
                {/* Only once there is something to keep. The working drawer at
                    /media holds every generated picture; this is what puts one
                    on the shelf things get published from. */}
                {staged[p.id] ? (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={keeping !== null || kept.has(p.id)}
                    onClick={() => void keep(p)}
                  >
                    {keeping === p.id ? (
                      <Spinner />
                    ) : (
                      <Icon name={kept.has(p.id) ? 'check-circle' : 'check'} size={13} />
                    )}
                    {kept.has(p.id) ? 'In your library' : 'Keep'}
                  </button>
                ) : null}
                {/* The poster is the point of this row, so its actions come
                    first. View opens it large and at any ratio; the other two
                    are the things people actually wanted to do with it. */}
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setPosterTemplate(template)
                    setPosterRatio('1:1')
                    setPoster(p)
                  }}
                >
                  <Icon name="eye" size={13} /> View
                </button>
                <button
                  type="button"
                  className="btn sm"
                  disabled={downloading}
                  onClick={() => void download(p, '1:1', template)}
                >
                  <Icon name="download" size={13} /> Download
                </button>
                <button type="button" className="btn sm" onClick={() => setPosting(p)}>
                  <Icon name="send" size={13} /> Post
                </button>
                <button type="button" className="btn sm" onClick={() => edit(p)}>
                  <Icon name="edit" size={13} /> Edit
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => void remove(p)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </FadeIn>
          ))}
        </div>
      )}

      {/* ── The poster, large ───────────────────────────────────────────────
          Ratio and template are chosen here rather than on the page, because
          this is where a person is looking at one poster and deciding whether
          it works. The list stays comparable; the drawer gets to experiment. */}
      <Drawer
        open={poster !== null}
        title={poster ? `Poster — ${poster.name}` : 'Poster'}
        onClose={() => setPoster(null)}
        footer={
          poster ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={downloading}
                onClick={() => void download(poster, posterRatio, posterTemplate)}
              >
                {downloading ? <Spinner /> : <Icon name="download" size={14} />} Download
              </button>
              {/* Free here and only here: the layout recomposes at each shape,
                  so every size is the same design rather than four generations.
                  An AI picture would have to be drawn again for each one and
                  would come back different. */}
              <button
                type="button"
                className="btn"
                disabled={downloading}
                onClick={() => void downloadAllSizes(poster, posterTemplate)}
              >
                {downloading ? <Spinner /> : <Icon name="images" size={14} />} All {RATIOS.length}{' '}
                sizes
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const target = poster
                  setPoster(null)
                  setPosting(target)
                }}
              >
                <Icon name="send" size={14} /> Post this
              </button>
            </>
          ) : null
        }
      >
        {poster ? (
          <>
            <Field label="Ratio">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {RATIOS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${posterRatio === value ? 'on' : ''}`}
                    onClick={() => setPosterRatio(value)}
                  >
                    {value} · {label}
                  </button>
                ))}
              </div>
            </Field>

            {templates.length > 0 ? (
              <Field label="Template">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {templates.map((t) => (
                    <button
                      key={t.slug}
                      type="button"
                      className={`chip ${posterTemplate === t.slug ? 'on' : ''}`}
                      onClick={() => setPosterTemplate(t.slug)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </Field>
            ) : null}

            {/* Keyed on every input, so switching ratio replaces the image
                rather than leaving the previous one on screen while the next
                request is in flight. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${poster.id}-${posterRatio}-${posterTemplate}`}
              src={previewSrc(poster.id, posterRatio, posterTemplate, staged[poster.id]?.id)}
              alt={`Poster for ${poster.name}`}
              crossOrigin="use-credentials"
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-sunken)',
              }}
            />
          </>
        ) : null}
      </Drawer>

      {/* ── Post it ─────────────────────────────────────────────────────────
          The media is stored only when Post is pressed — see storePoster. */}
      {posting ? (
        <PostComposer
          open
          subject={posting.name}
          initialCaption={posting.name}
          resolveMedia={() => storePoster(posting, posterRatio, posterTemplate)}
          onClose={() => setPosting(null)}
        />
      ) : null}
    </>
  )
}
