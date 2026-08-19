'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ApiError, api, apiUpload } from '@/lib/api'
import { EmptyState, PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * Transform — a photograph you already have, in another style.
 *
 * The third door into the system, and the one with no campaign attached. You do
 * not want a poster generated from a brief and you do not want a product staged;
 * you have a picture of your own café and you want to see it as a magazine page,
 * a film still and a newspaper cutting.
 *
 * Nothing here is asked to stay faithful, which is the whole difference from the
 * product path — and the reason a product should never come through this screen.
 * A packaged item whose label a customer recognises has to survive intact, and
 * these styles reinterpret freely.
 *
 * Styles are the `transform` group of the shared catalogue, so this screen and
 * the brief screen can never disagree about what exists.
 */

interface Direction {
  id: string
  name: string
  blurb: string
  group: string
  needs: string
}

interface Made {
  directionId: string
  url: string
}

export default function TransformPage() {
  return (
    <Suspense fallback={null}>
      <TransformInner />
    </Suspense>
  )
}

function TransformInner() {
  const toast = useToast()
  const search = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [styles, setStyles] = useState<Direction[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  /** Which style is currently rendering. One at a time — see `run`. */
  const [busy, setBusy] = useState<string | null>(null)
  const [made, setMade] = useState<Made[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ data: Direction[] }>('/creative-directions')
      .then((r) => setStyles((r.data ?? []).filter((d) => d.group === 'transform')))
      .catch(() => setStyles([]))
  }, [])

  /** A style chosen on the brief screen arrives as `?direction=`. */
  const wanted = search.get('direction')

  const upload = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await apiUpload<{ url: string }>('/uploads', form)
        setSource(res.url)
        // A new photograph invalidates everything made from the last one.
        setMade([])
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'That image could not be uploaded')
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [toast],
  )

  /**
   * Render one style.
   *
   * Deliberately one at a time rather than all ten at once: the image account is
   * metered per minute, and firing ten would fail most of them on a rate limit
   * that means "wait" rather than "no". Each result appears as it lands.
   */
  const run = useCallback(
    async (directionId: string) => {
      if (!source || busy) return
      setBusy(directionId)
      try {
        const res = await api.post<{ url: string }>('/scenes/transform', {
          imageUrl: source,
          directionId,
        })
        setMade((prev) => [
          { directionId, url: res.url },
          ...prev.filter((m) => m.directionId !== directionId),
        ])
      } catch (e) {
        toast.push('error', e instanceof ApiError ? e.message : 'That style could not be rendered')
      } finally {
        setBusy(null)
      }
    },
    [source, busy, toast],
  )

  return (
    <>
      <PageHeader
        title="Transform a photo"
        subtitle="Upload one picture and see it in as many styles as you like. Nothing here needs a campaign."
      />

      {!source ? (
        <FadeIn className="card" style={{ padding: 34, textAlign: 'center' }}>
          <EmptyState
            icon="image"
            title="Start with a photograph"
            hint="Your own picture — a dish, the room, a person at work. It stays the subject; only the style changes."
            action={
              <button
                type="button"
                className="btn primary"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Spinner /> : <Icon name="upload" size={15} />}
                {uploading ? 'Uploading…' : 'Choose a photo'}
              </button>
            }
          />
        </FadeIn>
      ) : (
        <>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start', marginBottom: 22 }}>
            <div className="card" style={{ padding: 10, width: 200, flex: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source}
                alt="Your photograph"
                style={{ width: '100%', borderRadius: 8, display: 'block' }}
              />
              <p
                className="type-caption"
                style={{ margin: '8px 0 0', color: 'var(--text-muted)', textAlign: 'center' }}
              >
                Original
              </p>
            </div>
            <div>
              <p className="type-body-strong" style={{ margin: 0 }}>
                Pick a style
              </p>
              <p className="type-secondary" style={{ margin: '4px 0 10px', maxWidth: '52ch' }}>
                One at a time, so the image service is not asked for ten in a minute — each appears
                as it finishes.
              </p>
              <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}>
                <Icon name="refresh" size={13} /> Use a different photo
              </button>
            </div>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}
          >
            {styles.map((style) => {
              const result = made.find((m) => m.directionId === style.id)
              const running = busy === style.id
              return (
                <div
                  key={style.id}
                  className="direction-card"
                  data-selected={wanted === style.id ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className="direction-card__art"
                    style={{ border: 0, padding: 0, cursor: result ? 'zoom-in' : 'pointer' }}
                    disabled={busy !== null && !running}
                    onClick={() => (result ? setOpen(result.url) : void run(style.id))}
                  >
                    {result ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.url} alt={style.name} loading="lazy" />
                    ) : (
                      <span className="direction-card__pending">
                        {running ? <Spinner /> : <Icon name="sparkles" size={17} />}
                      </span>
                    )}
                  </button>
                  <span className="direction-card__body">
                    <span className="direction-card__name">{style.name}</span>
                    <span className="direction-card__blurb">{style.blurb}</span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ marginTop: 7, alignSelf: 'flex-start' }}
                      disabled={busy !== null}
                      onClick={() => void run(style.id)}
                    >
                      {running ? <Spinner /> : <Icon name={result ? 'refresh' : 'zap'} size={13} />}
                      {running ? 'Rendering…' : result ? 'Again' : 'Render'}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {open ? (
        <div
          className="gallery__lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div className="gallery__panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn gallery__close"
              aria-label="Close"
              onClick={() => setOpen(null)}
            >
              <Icon name="x" size={16} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open} alt="" style={{ maxWidth: '100%', display: 'block' }} />
          </div>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
        }}
      />
    </>
  )
}
