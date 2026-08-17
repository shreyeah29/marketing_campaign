'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { Drawer, useToast } from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PlatformIcon } from '@/components/platform-icon'

/**
 * Post this picture — one drawer, used from Products and from Creatives.
 *
 * It exists because both screens needed the same four decisions (which accounts,
 * what caption, now or later, and which file) and neither should own them. The
 * caller supplies a way to obtain the media id; everything else lives here.
 *
 * Two things it will not do:
 *
 *   · It does not pretend an account can post when it cannot. `canPublish` comes
 *     from the API, an account without it cannot be selected, and the reason is
 *     printed beside it. Offering the choice and failing at the scheduled minute
 *     is how the product previously told people a post had gone out.
 *   · It does not resolve the media until Post is pressed. Rendering and storing
 *     a poster for a drawer someone opened and closed would fill the bucket with
 *     files nobody asked for.
 */

interface Account {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
  canPublish: boolean
  publishNote: string | null
}

export interface PostComposerProps {
  open: boolean
  /** Shown in the drawer header, e.g. the product or poster name. */
  subject: string
  /** Starting caption. The person can rewrite it. */
  initialCaption?: string
  /** Starting hashtags, space separated, without the #. */
  initialHashtags?: string
  /**
   * Produces the media id to attach, called once when Post is pressed.
   *
   * Async because both callers have to render and store first. Returning null
   * means "there is nothing to attach", and the composer refuses rather than
   * publishing a caption on its own — Instagram would reject it anyway.
   */
  resolveMedia: () => Promise<{ mediaId: string; url: string } | null>
  onClose: () => void
  onPosted?: (() => void) | undefined
}

/** `datetime-local` wants local wall-clock with no zone; this is now + minutes. */
function localInputValue(offsetMinutes: number): string {
  const t = new Date(Date.now() + offsetMinutes * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(t.getFullYear())}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export function PostComposer({
  open,
  subject,
  initialCaption = '',
  initialHashtags = '',
  resolveMedia,
  onClose,
  onPosted,
}: PostComposerProps) {
  const toast = useToast()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [caption, setCaption] = useState(initialCaption)
  const [hashtags, setHashtags] = useState(initialHashtags)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState(() => localInputValue(60))
  const [busy, setBusy] = useState(false)

  // Re-seed each time the drawer opens for a different subject: a caption left
  // over from the last product is worse than an empty box.
  useEffect(() => {
    if (!open) return
    setCaption(initialCaption)
    setHashtags(initialHashtags)
    setWhen('now')
    setAt(localInputValue(60))
  }, [open, subject, initialCaption, initialHashtags])

  const load = useCallback(() => {
    api
      .get<Account[]>('/social/accounts')
      .then((list) => {
        const connected = list.filter((a) => a.status === 'CONNECTED')
        setAccounts(connected)
        // Preselect only what can actually publish, and only when there is no
        // ambiguity about which one is meant.
        const ready = connected.filter((a) => a.canPublish)
        if (ready.length === 1 && ready[0]) setChosen(new Set([ready[0].id]))
      })
      .catch(() => setAccounts([]))
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (chosen.size === 0) {
      toast.push('error', 'Choose at least one account')
      return
    }
    if (!caption.trim()) {
      toast.push('error', 'Write a caption')
      return
    }
    const scheduledAt = when === 'later' ? new Date(at) : null
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      toast.push('error', 'That date is not valid')
      return
    }

    setBusy(true)
    try {
      const media = await resolveMedia()
      if (!media) {
        toast.push('error', 'There is no picture to post yet')
        return
      }

      await api.post('/social/posts', {
        body: caption.trim(),
        hashtags: hashtags
          .split(/[\s,]+/)
          .map((h) => h.replace(/^#/, '').trim())
          .filter(Boolean),
        accountIds: [...chosen],
        mediaIds: [media.mediaId],
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
      })

      toast.push(
        'success',
        scheduledAt
          ? `Scheduled for ${scheduledAt.toLocaleString()}`
          : 'Queued — it goes out on the next run',
      )
      onPosted?.()
      onClose()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not create the post')
    } finally {
      setBusy(false)
    }
  }

  const ready = (accounts ?? []).filter((a) => a.canPublish)

  return (
    <Drawer
      open={open}
      title={`Post — ${subject}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void submit()}
            disabled={busy || ready.length === 0}
          >
            {busy ? <Spinner /> : <Icon name={when === 'later' ? 'calendar' : 'send'} size={14} />}
            {when === 'later' ? 'Schedule' : 'Post now'}
          </button>
        </>
      }
    >
      <Field label="Post to">
        {accounts === null ? (
          <Spinner />
        ) : accounts.length === 0 ? (
          <p className="type-secondary" style={{ margin: 0 }}>
            No accounts are connected. Connect one under Channels first.
          </p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {accounts.map((a) => (
              <div key={a.id} className="stack" style={{ gap: 4 }}>
                <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(a.id)}
                    disabled={!a.canPublish}
                    onChange={() => toggle(a.id)}
                  />
                  <PlatformIcon platform={a.platform} size={14} />
                  <span>{a.displayName ?? a.handle ?? a.platform}</span>
                </label>
                {/* The reason, not just a disabled box. A control that cannot be
                    used and does not say why reads as a bug. */}
                {!a.canPublish && a.publishNote ? (
                  <p
                    className="type-caption"
                    style={{ margin: '0 0 0 26px', color: 'var(--text-tertiary)' }}
                  >
                    {a.publishNote}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="Caption">
        <textarea
          className="input"
          rows={5}
          value={caption}
          placeholder="What goes with this picture?"
          onChange={(e) => setCaption(e.target.value)}
        />
      </Field>

      <Field label="Hashtags" hint="Space or comma separated — the # is optional">
        <input
          className="input"
          value={hashtags}
          placeholder="latte caramel alwayssunday"
          onChange={(e) => setHashtags(e.target.value)}
        />
      </Field>

      <Field label="When">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`chip ${when === 'now' ? 'on' : ''}`}
            onClick={() => setWhen('now')}
          >
            Post now
          </button>
          <button
            type="button"
            className={`chip ${when === 'later' ? 'on' : ''}`}
            onClick={() => setWhen('later')}
          >
            Schedule
          </button>
        </div>
        {when === 'later' ? (
          <input
            className="input"
            type="datetime-local"
            value={at}
            style={{ marginTop: 8 }}
            onChange={(e) => setAt(e.target.value)}
          />
        ) : null}
      </Field>
    </Drawer>
  )
}
