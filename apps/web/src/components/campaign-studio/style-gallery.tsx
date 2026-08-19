'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, api, apiUpload } from '@/lib/api'
import { Icon } from '@/components/icon'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/kit'

/**
 * Saved looks — the workspace's own styles, browsable and reusable.
 *
 * The ask was precise: uploading style references should *create a brand
 * template*, the workspace should be able to keep several, and someone should be
 * able to look through them — "they never stick to only one type of poster."
 *
 * That last clause is what makes this a gallery rather than a setting. The brand
 * kit already has a single `visualStyle` string applied to everything, and it
 * cannot describe a business running festive artwork in October and clean
 * product shots in November.
 *
 * Uploading here does not attach a picture to a campaign. It reads the picture
 * once — palette, light, texture, mood — and saves the description under a name.
 * After that the picture is never sent to a generator again: every poster in
 * every run using this style receives the identical paragraph, which is what
 * makes a set look like a set rather than five separate interpretations of the
 * same reference.
 */

export interface SavedStyle {
  id: string
  name: string
  referenceUrl: string
  look: string
  summary: string | null
  timesUsed: number
}

export function StyleGallery({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null
  onSelect: (id: string | null) => void
}) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [styles, setStyles] = useState<SavedStyle[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: SavedStyle[] }>('/style-templates')
      setStyles(res.data ?? [])
    } catch {
      // A workspace with no styles and a workspace that could not load them look
      // the same from here, and neither should break the brief screen. The
      // create path reports its own failures loudly, which is where it matters.
      setStyles([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Upload, then read.
   *
   * Two calls on purpose. `/uploads` re-encodes, strips EXIF and stores the
   * result on our own host — and the reader only accepts a URL on that host,
   * because the server fetches it and sends it to OpenAI. Reading straight from
   * a client-supplied address would make this a request forwarder.
   */
  async function saveFrom(file: File) {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const uploaded = await apiUpload<{ url: string }>('/uploads', form)
      const created = await api.post<SavedStyle>('/style-templates', {
        referenceUrl: uploaded.url,
      })
      setStyles((prev) => [created, ...(prev ?? [])])
      onSelect(created.id)
      toast.push('success', `Saved as “${created.name}”`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'That picture could not be saved')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/style-templates/${id}`)
      setStyles((prev) => (prev ?? []).filter((s) => s.id !== id))
      if (selectedId === id) onSelect(null)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not remove that style')
    }
  }

  const list = styles ?? []

  return (
    <section style={{ marginTop: 22 }}>
      <div className="suggest-group-label">YOUR SAVED LOOKS</div>
      <p className="type-secondary" style={{ margin: '0 0 12px' }}>
        Upload a design you like and it is read once into a named style. Pick one and every picture
        in this campaign is made with the same eye.
      </p>

      <div className="style-strip">
        {/* Add, first: an empty gallery still has to explain what it is for. */}
        <button
          type="button"
          className="style-card style-card--add"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Spinner /> : <Icon name="plus" size={18} />}
          <span>{busy ? 'Reading the picture…' : 'Add a look'}</span>
        </button>

        {list.map((style) => {
          const on = selectedId === style.id
          return (
            <div key={style.id} className="style-card" data-selected={on ? 'true' : undefined}>
              <button
                type="button"
                className="style-card__hit"
                aria-pressed={on}
                onClick={() => onSelect(on ? null : style.id)}
                title={style.summary ?? style.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={style.referenceUrl} alt="" loading="lazy" />
                {on ? (
                  <span className="style-card__tick">
                    <Icon name="check" size={12} />
                  </span>
                ) : null}
              </button>
              <div className="style-card__foot">
                <span className="style-card__name">{style.name}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`What “${style.name}” means`}
                  onClick={() => setOpen(open === style.id ? null : style.id)}
                >
                  <Icon name="eye" size={12} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${style.name}`}
                  onClick={() => void remove(style.id)}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {/* The paragraph the generator actually receives. Shown because a
                  style that silently changes pictures is impossible to trust or
                  to correct — and a wrong reading is obvious the moment it is
                  legible. */}
              {open === style.id ? <p className="style-card__look">{style.look}</p> : null}
            </div>
          )
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void saveFrom(file)
        }}
      />
    </section>
  )
}
