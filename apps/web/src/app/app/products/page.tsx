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
  const previewSrc = useCallback(
    (id: string, ratio: string, slug: string) =>
      `${api.base}/products/${id}/preview?ratio=${encodeURIComponent(ratio)}&template=${encodeURIComponent(slug)}`,
    [],
  )

  /**
   * Download the poster.
   *
   * Fetched with credentials rather than linked: the render requires the session
   * cookie, and an anchor would send none and save a 401 body as a .png. See
   * lib/download.ts.
   */
  async function download(product: Product, ratio: string, slug: string) {
    setDownloading(true)
    try {
      await downloadUrl(
        previewSrc(product.id, ratio, slug),
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="product-row__preview"
                src={`${api.base}/products/${p.id}/preview?ratio=1:1&template=${template}`}
                alt={`Poster preview for ${p.name}`}
                crossOrigin="use-credentials"
                loading="lazy"
              />

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
              src={previewSrc(poster.id, posterRatio, posterTemplate)}
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
