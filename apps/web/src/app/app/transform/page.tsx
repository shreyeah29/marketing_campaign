'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { ApiError, api, apiUpload } from '@/lib/api'
import { EmptyState, PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { DirectionArt, hasDirectionArt } from '@/components/campaign-studio/direction-art'

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
  /** A committed example file exists for this style. */
  hasSample?: boolean
  /** A generated example, when no file is committed yet. */
  previewUrl?: string | null
}

interface Made {
  directionId: string
  /** The media row, so it can be kept without generating it again. */
  id: string
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
  const [keeping, setKeeping] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())

  /**
   * Everything transformed before now.
   *
   * Loaded rather than held only in this component: a picture that disappears on
   * refresh is one someone paid for and then lost. The bytes were always
   * durable — nothing listed them, so they were invisible the moment the tab
   * that made them closed.
   */
  useEffect(() => {
    api
      .get<{ data: { id: string; url: string; directionId: string | null }[] }>(
        '/media?kind=transform',
      )
      .then((r) => {
        // Newest first from the API, so the first of each style wins.
        const seen = new Set<string>()
        const rows: Made[] = []
        for (const row of r.data ?? []) {
          if (!row.directionId || seen.has(row.directionId)) continue
          seen.add(row.directionId)
          rows.push({ directionId: row.directionId, id: row.id, url: row.url })
        }
        setMade(rows)
      })
      .catch(() => undefined)
  }, [])

  /** Promote one into the reviewed library, beside approved campaign work. */
  async function keep(style: Direction, result: Made) {
    if (keeping) return
    setKeeping(style.id)
    try {
      await api.post(`/media/${result.id}/keep`, { title: `Transformed — ${style.name}` })
      setKept((prev) => new Set(prev).add(style.id))
      toast.push('success', 'Saved to Images & video')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save that picture')
    } finally {
      setKeeping(null)
    }
  }

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
        const res = await api.post<{ mediaId: string; url: string }>('/scenes/transform', {
          imageUrl: source,
          directionId,
        })
        setMade((prev) => [
          { directionId, id: res.mediaId, url: res.url },
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
                    style={{
                      border: 0,
                      padding: 0,
                      position: 'relative',
                      cursor: result ? 'zoom-in' : 'pointer',
                    }}
                    disabled={busy !== null && !running}
                    onClick={() => (result ? setOpen(result.url) : void run(style.id))}
                  >
                    {/* Your picture once it exists, the style's own example
                        until then. Showing a placeholder while a real example of
                        every one of these styles sits in storage is what this
                        screen was doing, and it made a gallery of grey boxes out
                        of a gallery of styles. */}
                    {result ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.url} alt={style.name} loading="lazy" />
                    ) : (
                      <DirectionArt direction={style} />
                    )}
                    {/* Which picture this is. Without it an example and a result
                        are indistinguishable, and someone would download the
                        coffee cup thinking it was their own photo restyled. */}
                    {!running && (result || hasDirectionArt(style)) ? (
                      <span className="direction-card__badge">{result ? 'Yours' : 'Example'}</span>
                    ) : null}
                    {running ? (
                      <span className="direction-card__working">
                        <Spinner />
                      </span>
                    ) : null}
                  </button>
                  <span className="direction-card__body">
                    <span className="direction-card__name">{style.name}</span>
                    <span className="direction-card__blurb">{style.blurb}</span>
                    <span className="row" style={{ gap: 6, marginTop: 7 }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy !== null}
                        onClick={() => void run(style.id)}
                      >
                        {running ? (
                          <Spinner />
                        ) : (
                          <Icon name={result ? 'refresh' : 'zap'} size={13} />
                        )}
                        {running ? 'Rendering…' : result ? 'Again' : 'Render'}
                      </button>
                      {/* Only once there is something to keep. Everything
                          generated already lives in the working drawer; this is
                          what puts one on the shelf things get published from. */}
                      {result ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={keeping !== null || kept.has(style.id)}
                          onClick={() => void keep(style, result)}
                        >
                          {keeping === style.id ? (
                            <Spinner />
                          ) : (
                            <Icon name={kept.has(style.id) ? 'check-circle' : 'check'} size={13} />
                          )}
                          {kept.has(style.id) ? 'In your library' : 'Keep'}
                        </button>
                      ) : null}
                    </span>
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
