'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, api, apiUpload } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'

/**
 * Your styles — the looks this business works in, as its own shelf.
 *
 * Separate from Images & video on purpose, and the distinction is not filing.
 * That library holds *pictures*: finished work, made for a campaign, published
 * or waiting to be. A style is not a picture — it is an instruction, read once
 * from a design and applied to everything made afterwards. Filing the two
 * together would bury a handful of durable decisions among hundreds of outputs
 * of those decisions.
 *
 * It is also the only shelf here that is genuinely the client's own. The
 * creative directions are ours and identical in every workspace; these were
 * uploaded by this business because it is how their work looks.
 *
 * The picker on the brief screen shows the same list. This is where they are
 * managed — named, corrected and removed — because that is a different job from
 * choosing one mid-brief and does not belong in the middle of writing one.
 */

interface SavedStyle {
  id: string
  name: string
  referenceUrl: string
  look: string
  summary: string | null
  timesUsed: number
  createdAt?: string
}

export default function StylesPage() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [styles, setStyles] = useState<SavedStyle[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftLook, setDraftLook] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get<{ data: SavedStyle[] }>('/style-templates')
      setStyles(res.data ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your styles')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Upload, then read.
   *
   * Two calls on purpose. `/uploads` re-encodes, strips EXIF and stores the
   * result on our own host; the reader only accepts a URL on that host, because
   * the bytes are pulled server-side. Reading straight from a client-supplied
   * address would make this a request forwarder.
   */
  async function add(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const uploaded = await apiUpload<{ url: string }>('/uploads', form)
      const created = await api.post<SavedStyle>('/style-templates', {
        referenceUrl: uploaded.url,
      })
      setStyles((prev) => [created, ...(prev ?? [])])
      toast.push('success', `Saved as “${created.name}”`)
    } catch (e) {
      // The API distinguishes "your picture could not be fetched", "this project
      // has no vision model" and "the reading failed", so its own words are more
      // useful here than anything this screen could invent.
      toast.push('error', e instanceof ApiError ? e.message : 'That picture could not be saved')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save(style: SavedStyle) {
    try {
      const updated = await api.patch<SavedStyle>(`/style-templates/${style.id}`, {
        name: draftName.trim(),
        look: draftLook.trim(),
      })
      setStyles((prev) => (prev ?? []).map((s) => (s.id === style.id ? updated : s)))
      setEditing(null)
      toast.push('success', 'Saved')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save that change')
    }
  }

  async function remove(style: SavedStyle) {
    try {
      await api.del(`/style-templates/${style.id}`)
      setStyles((prev) => (prev ?? []).filter((s) => s.id !== style.id))
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not remove that style')
    }
  }

  return (
    <>
      <PageHeader
        title="Your styles"
        subtitle="Designs you uploaded, read once into a look. Pick one on a brief and everything in that campaign is made with the same eye."
        actions={
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Spinner /> : <Icon name="plus" size={15} />}
            {busy ? 'Reading the picture…' : 'Add a style'}
          </button>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {styles === null && !error ? (
        <div className="row" style={{ gap: 8, padding: 40 }}>
          <Spinner />
          <span className="type-secondary">Loading your styles…</span>
        </div>
      ) : null}

      {styles !== null && styles.length === 0 ? (
        <EmptyState
          icon="images"
          title="No styles yet"
          hint="Upload a design you like — a poster, an ad, a photograph. It is read once into a written look, and never sent to a generator again."
          action={
            <button type="button" className="btn primary" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={15} /> Add your first
            </button>
          }
        />
      ) : null}

      {styles && styles.length > 0 ? (
        <div className="stack" style={{ gap: 12 }}>
          {styles.map((style) => (
            <FadeIn key={style.id} className="card" style={{ display: 'flex', gap: 16 }}>
              {/* Bucket URL, so no `crossOrigin` — the opposite of the API-origin
                  renders elsewhere, which refuse to load without it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={style.referenceUrl}
                alt={style.name}
                loading="lazy"
                style={{
                  width: 130,
                  height: 130,
                  flex: 'none',
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                }}
              />

              <div style={{ minWidth: 0, flex: 1 }}>
                {editing === style.id ? (
                  <>
                    <input
                      className="input"
                      value={draftName}
                      maxLength={40}
                      onChange={(e) => setDraftName(e.target.value)}
                      style={{ marginBottom: 8 }}
                    />
                    {/* The written look is editable because a reading can be
                        nearly right, and re-uploading to fix one clause would
                        cost another vision call for no reason. */}
                    <textarea
                      className="input"
                      rows={4}
                      value={draftLook}
                      maxLength={900}
                      onChange={(e) => setDraftLook(e.target.value)}
                    />
                    <div className="row" style={{ gap: 7, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn primary sm"
                        onClick={() => void save(style)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="spread" style={{ gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="type-body-strong" style={{ margin: 0 }}>
                          {style.name}
                        </p>
                        <p
                          className="type-caption"
                          style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}
                        >
                          {style.timesUsed === 0
                            ? 'Not used yet'
                            : `Used in ${String(style.timesUsed)} ${style.timesUsed === 1 ? 'campaign' : 'campaigns'}`}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            setEditing(style.id)
                            setDraftName(style.name)
                            setDraftLook(style.look)
                          }}
                        >
                          <Icon name="edit" size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${style.name}`}
                          onClick={() => void remove(style)}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                    {/* Shown, not hidden. A style that silently changes every
                        picture is impossible to trust or to correct, and a
                        wrong reading is obvious the moment it is legible. */}
                    <p className="type-secondary" style={{ margin: '9px 0 0', lineHeight: 1.55 }}>
                      {style.look}
                    </p>
                  </>
                )}
              </div>
            </FadeIn>
          ))}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void add(file)
        }}
      />
    </>
  )
}
