'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { FadeIn } from '@/components/motion'

interface LandingPageRow {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  visitCount: number
  updatedAt: string
}

const STATUS_TINT: Record<string, string> = {
  DRAFT: 'info',
  PUBLISHED: 'ok',
  ARCHIVED: 'warn',
}

export default function LandingPagesListPage() {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<LandingPageRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const load = useCallback(() => {
    setError(null)
    api
      .get<LandingPageRow[]>('/landing-pages')
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [])
  useEffect(load, [load])

  async function create() {
    if (name.trim().length === 0) return
    setBusy(true)
    try {
      const page = await api.post<LandingPageRow>('/landing-pages', {
        name: name.trim(),
        ...(title.trim().length > 0 ? { title: title.trim() } : {}),
      })
      toast.push('success', 'Page created')
      setCreating(false)
      setName('')
      setTitle('')
      router.push(`/app/marketing/pages/${page.id}`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  function copyLink(slug: string) {
    const url = `${origin}/p/${slug}`
    void navigator.clipboard?.writeText(url)
    toast.push('success', 'Public link copied')
  }

  return (
    <>
      <PageHeader
        title="Landing Pages"
        subtitle="Build focused pages to capture leads from your campaigns."
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New page
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <TableSkeleton cols={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="layout"
          title="No landing pages yet"
          hint="Create your first page, add blocks, then publish it to a public URL."
        />
      ) : (
        <FadeIn delay={0.12} className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Visits</th>
                <th>Public link</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/app/marketing/pages/${r.id}`)}
                >
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>
                    <Badge status={STATUS_TINT[r.status]}>{r.status}</Badge>
                  </td>
                  <td>{r.visitCount}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {r.status === 'PUBLISHED' ? (
                      <div className="row" style={{ gap: 8 }}>
                        <a
                          href={`${origin}/p/${r.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="dim"
                          style={{ fontSize: 12 }}
                        >
                          /p/{r.slug}
                        </a>
                        <button className="btn ghost sm" onClick={() => copyLink(r.slug)}>
                          Copy
                        </button>
                      </div>
                    ) : (
                      <span className="dim" style={{ fontSize: 12 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="dim" style={{ fontSize: 12 }}>
                    {new Date(r.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FadeIn>
      )}

      {creating ? (
        <Drawer
          open
          title="New landing page"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || name.trim().length === 0}
                onClick={() => void create()}
              >
                {busy ? <Spinner /> : 'Create'}
              </button>
            </>
          }
        >
          <Field label="Name">
            <input
              className="input"
              placeholder="Summer sale"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Title" hint="Optional — shown as the page heading and browser title.">
            <input
              className="input"
              placeholder="Save 30% this summer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
        </Drawer>
      ) : null}
    </>
  )
}
