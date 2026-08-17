'use client'

import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { PlatformIcon } from '@/components/platform-icon'
import { Chip, StatusPill, toStatus } from '@/components/status'

// ── Types ───────────────────────────────────────────────────────────────────

interface SocialAccount {
  id: string
  platform: string
  handle: string | null
  displayName: string | null
  status: string
  followerCount: number | null
  avatarUrl: string | null
  /** Whether a post to this account would reach the network. Server-computed. */
  canPublish: boolean
  publishNote: string | null
}

interface SocialPostTarget {
  id: string
  socialAccountId: string
  handle: string | null
  platform: string
  status: string
  permalink: string | null
  failureReason: string | null
  publishedAt: string | null
}

interface SocialPost {
  id: string
  status: string
  body: string
  hashtags: string[]
  scheduledAt: string | null
  publishedAt: string | null
  createdAt: string
  targets: SocialPostTarget[]
}

// ChannelType values that are offered as social destinations.
const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE'] as const

// ── Page ─────────────────────────────────────────────────────────────────────

const PLATFORM_TITLES: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
}

/**
 * The social hub. Unlocked it is the all-platforms Social page; locked it is a
 * single channel's room (Instagram, Facebook, …) — same engine, one lens.
 */
export function SocialHub({ locked }: { locked?: string }) {
  const toast = useToast()
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null)
  const [posts, setPosts] = useState<SocialPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [disconnectId, setDisconnectId] = useState<string | null>(null)

  const [platformTab, setPlatformTab] = useState<string | null>(locked ?? null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      api.get<SocialAccount[]>('/social/accounts'),
      api.get<SocialPost[]>('/social/posts'),
    ])
      .then(([a, p]) => {
        setAccounts(a)
        setPosts(p)
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [])
  useEffect(load, [load])

  const allConnected = (accounts ?? []).filter((a) => a.status === 'CONNECTED')
  // The hub tabs: every platform with an account or a post, so each channel has
  // its own room with its own numbers.
  const hubPlatforms = [
    ...new Set([
      ...allConnected.map((a) => a.platform),
      ...(posts ?? []).flatMap((p) => p.targets.map((t) => t.platform)),
    ]),
  ].sort()
  const connected = platformTab
    ? allConnected.filter((a) => a.platform === platformTab)
    : allConnected
  const visiblePosts = platformTab
    ? (posts ?? []).filter((p) => p.targets.some((t) => t.platform === platformTab))
    : (posts ?? [])
  const hubStats = platformTab
    ? {
        published: visiblePosts.filter((p) =>
          p.targets.some((t) => t.platform === platformTab && t.status === 'PUBLISHED'),
        ).length,
        scheduled: visiblePosts.filter((p) =>
          p.targets.some((t) => t.platform === platformTab && t.status === 'SCHEDULED'),
        ).length,
        failed: visiblePosts.filter((p) =>
          p.targets.some((t) => t.platform === platformTab && t.status === 'FAILED'),
        ).length,
      }
    : null

  async function disconnect(id: string) {
    try {
      await api.del(`/social/accounts/${id}`)
      toast.push('success', 'Account disconnected')
      setDisconnectId(null)
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Disconnect failed')
    }
  }

  async function publishNow(id: string) {
    try {
      await api.post(`/social/posts/${id}/publish-now`, {})
      toast.push('success', 'Queued to publish on the next run')
      load()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to queue')
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Social" subtitle="Connect accounts, compose and schedule posts." />
        <ErrorState message={error} onRetry={load} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={locked ? (PLATFORM_TITLES[locked] ?? locked) : 'Social'}
        subtitle={
          locked
            ? `Your ${(PLATFORM_TITLES[locked] ?? locked).toLowerCase()} room — posts, scheduling and results in one place.`
            : 'Connect accounts, compose and schedule posts across every channel.'
        }
      />

      {/* ── Platform hubs — each channel is its own room ─────────────────── */}
      {hubPlatforms.length > 0 && !locked ? (
        <div className="toolbar" style={{ gap: 8, marginBottom: 16 }}>
          <button
            className={`chip ${platformTab === null ? 'on' : ''}`}
            onClick={() => setPlatformTab(null)}
          >
            All platforms
          </button>
          {hubPlatforms.map((p) => (
            <button
              key={p}
              className={`chip ${platformTab === p ? 'on' : ''}`}
              onClick={() => setPlatformTab(platformTab === p ? null : p)}
            >
              <PlatformIcon platform={p} size={14} /> {p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      ) : null}

      {hubStats ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Chip>{hubStats.published} published</Chip>
          <Chip>{hubStats.scheduled} scheduled</Chip>
          {hubStats.failed > 0 ? <Chip>{hubStats.failed} failed</Chip> : null}
          <span className="dim" style={{ fontSize: 12 }}>
            Reach, clicks and audience demographics appear here per post once the platform account
            is connected for insights.
          </span>
        </div>
      ) : null}

      {/* ── Connections ─────────────────────────────────────────────────── */}
      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Connections</h2>
        <button className="btn primary sm" onClick={() => setConnectOpen(true)}>
          + Connect account
        </button>
      </div>

      <div className="banner info" style={{ marginBottom: 14 }}>
        Adding an account here records the handle for planning and scheduling. Posting to Instagram
        or Facebook happens through the Meta connection under Channels — a handle on its own cannot
        publish.
      </div>

      {accounts === null ? (
        <TableSkeleton rows={2} cols={3} />
      ) : connected.length === 0 ? (
        <EmptyState
          icon="plug"
          title="No accounts connected"
          hint="Connect an account to start scheduling posts."
        />
      ) : (
        <Stagger className="cols-2 grid" interval={0.05} style={{ marginBottom: 24 }}>
          {connected.map((a) => (
            <StaggerItem key={a.id} className="card">
              <div className="spread">
                <div className="row" style={{ gap: 10 }}>
                  <PlatformIcon platform={a.platform} size={22} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.displayName ?? a.handle ?? a.platform}</div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {a.handle ? `@${a.handle.replace(/^@/, '')}` : a.platform}
                      {a.followerCount != null
                        ? ` · ${a.followerCount.toLocaleString()} followers`
                        : ''}
                    </div>
                  </div>
                </div>
                {/* "Connected" used to mean only "the row exists", which reads
                    as "posts will go out". The label now states which of the two
                    it is. Neutral, not coloured: the status vocabulary has
                    eleven members and this is not a twelfth. */}
                <Chip title={a.publishNote ?? undefined}>
                  {a.status !== 'CONNECTED'
                    ? 'Not connected'
                    : a.canPublish
                      ? 'Ready to post'
                      : 'Cannot post yet'}
                </Chip>
              </div>
              {a.publishNote ? (
                <p
                  className="type-caption"
                  style={{ margin: '10px 0 0', color: 'var(--text-tertiary)' }}
                >
                  {a.publishNote}
                </p>
              ) : null}
              <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn danger sm" onClick={() => setDisconnectId(a.id)}>
                  Disconnect
                </button>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '8px 0 12px' }}>Compose</h2>
      <Composer accounts={connected} onCreated={load} />

      {/* ── Scheduled / published posts ─────────────────────────────────── */}
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '24px 0 12px' }}>Posts</h2>
      {posts === null ? (
        <TableSkeleton rows={4} cols={3} />
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title={platformTab ? `No posts on ${platformTab.toLowerCase()} yet` : 'No posts yet'}
          hint="Compose a post above — or approve a campaign creative and publish it here."
        />
      ) : (
        <FadeIn delay={0.18} className="stack" style={{ gap: 10 }}>
          {visiblePosts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onPublishNow={() => void publishNow(p.id)}
              onDeleted={load}
            />
          ))}
        </FadeIn>
      )}

      {connectOpen ? (
        <ConnectDrawer
          onClose={() => setConnectOpen(false)}
          onConnected={() => {
            setConnectOpen(false)
            load()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={disconnectId !== null}
        title="Disconnect account?"
        message="Scheduled posts targeting this account will no longer publish to it."
        confirmLabel="Disconnect"
        danger
        onConfirm={() => disconnectId && void disconnect(disconnectId)}
        onCancel={() => setDisconnectId(null)}
      />
    </>
  )
}

// ── Connect drawer ────────────────────────────────────────────────────────────

function ConnectDrawer({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const toast = useToast()
  const [platform, setPlatform] = useState<string>(PLATFORMS[0])
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (handle.trim().length === 0) return
    setBusy(true)
    try {
      await api.post('/social/accounts/connect', {
        platform,
        handle: handle.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      })
      toast.push('success', 'Account connected')
      onConnected()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Connect failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      title="Connect account"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || handle.trim().length === 0}
            onClick={() => void submit()}
          >
            {busy ? <Spinner /> : 'Connect'}
          </button>
        </>
      }
    >
      <div className="banner info" style={{ marginBottom: 14 }}>
        This records the handle so you can plan and schedule against it. It does not authorise
        posting: Instagram and Facebook publish through the Meta connection under Channels, and the
        other networks need their own approved apps.
      </div>
      <Field label="Platform">
        <select className="select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Handle" hint="e.g. your @username on the platform">
        <input
          className="input"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="acme.co"
        />
      </Field>
      <Field label="Display name (optional)">
        <input
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Acme Marketing"
        />
      </Field>
    </Drawer>
  )
}

// ── Composer ──────────────────────────────────────────────────────────────────

function Composer({ accounts, onCreated }: { accounts: SocialAccount[]; onCreated: () => void }) {
  const toast = useToast()
  const [body, setBody] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState<'schedule' | 'now' | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(mode: 'schedule' | 'now') {
    if (body.trim().length === 0) {
      toast.push('error', 'Write something to post')
      return
    }
    if (selected.size === 0) {
      toast.push('error', 'Select at least one account')
      return
    }
    const tags = hashtags
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter((t) => t.length > 0)

    setBusy(mode)
    try {
      await api.post('/social/posts', {
        body: body.trim(),
        hashtags: tags,
        accountIds: [...selected],
        ...(mode === 'schedule' && scheduledAt
          ? { scheduledAt: new Date(scheduledAt).toISOString() }
          : {}),
      })
      toast.push('success', mode === 'now' ? 'Queued to post now' : 'Post scheduled')
      setBody('')
      setHashtags('')
      setScheduledAt('')
      setSelected(new Set())
      onCreated()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Failed to create post')
    } finally {
      setBusy(null)
    }
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="edit"
        title="Connect an account first"
        hint="You need at least one connected account before you can compose a post."
      />
    )
  }

  return (
    <FadeIn delay={0.12} className="card">
      <Field label="Post">
        <textarea
          className="input"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you want to share?"
        />
      </Field>
      <Field label="Hashtags" hint="Space or comma separated — the # is optional">
        <input
          className="input"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          placeholder="launch product marketing"
        />
      </Field>

      <Field label="Post to">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {accounts.map((a) => {
            const on = selected.has(a.id)
            return (
              <label
                key={a.id}
                className={`chip ${on ? 'on' : ''}`}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(a.id)}
                  style={{ margin: 0 }}
                />
                <PlatformIcon platform={a.platform} size={15} /> {a.handle ?? a.platform}
              </label>
            )
          })}
        </div>
      </Field>

      <div className="toolbar" style={{ marginTop: 12 }}>
        <Field label="Schedule for (optional)">
          <input
            className="input"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </Field>
        <div className="grow" />
        <button className="btn" disabled={busy !== null} onClick={() => void submit('schedule')}>
          {busy === 'schedule' ? (
            <Spinner />
          ) : scheduledAt ? (
            <>
              <Icon name="clock" size={15} /> Schedule
            </>
          ) : (
            'Schedule'
          )}
        </button>
        <button className="btn primary" disabled={busy !== null} onClick={() => void submit('now')}>
          {busy === 'now' ? <Spinner /> : 'Post now'}
        </button>
      </div>
    </FadeIn>
  )
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onPublishNow,
  onDeleted,
}: {
  post: SocialPost
  onPublishNow: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function del() {
    try {
      await api.del(`/social/posts/${post.id}`)
      toast.push('success', 'Post deleted')
      setConfirmDelete(false)
      onDeleted()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  const when = post.publishedAt ?? post.scheduledAt
  const whenLabel = post.publishedAt ? 'Published' : 'Scheduled'

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <StatusPill status={toStatus(post.status)} />
          {when ? (
            <span className="dim" style={{ fontSize: 12 }}>
              {whenLabel} {new Date(when).toLocaleString()}
            </span>
          ) : null}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {post.status === 'SCHEDULED' ? (
            <button className="btn sm" onClick={onPublishNow}>
              Publish now
            </button>
          ) : null}
          <button
            className="btn ghost sm"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.body}</div>

      {post.hashtags.length > 0 ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {post.hashtags.map((h) => (
            <Chip key={h}>#{h.replace(/^#/, '')}</Chip>
          ))}
        </div>
      ) : null}

      <div className="stack" style={{ gap: 4, marginTop: 12 }}>
        {post.targets.map((t) => (
          <div key={t.id} className="spread" style={{ fontSize: 12 }}>
            <span className="row" style={{ gap: 6 }}>
              <PlatformIcon platform={t.platform} size={14} />{' '}
              {t.handle ? `@${t.handle.replace(/^@/, '')}` : t.platform}
              <StatusPill status={toStatus(t.status)} />
            </span>
            <span className="row" style={{ gap: 8 }}>
              {t.failureReason ? <span className="dim">{t.failureReason}</span> : null}
              {t.permalink ? (
                <a
                  href={t.permalink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  View <Icon name="external-link" size={13} />
                </a>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete post?"
        message="This removes the post and its scheduled targets."
        confirmLabel="Delete"
        danger
        onConfirm={() => void del()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
