'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Stagger, StaggerItem } from '@/components/motion'
import { StatusPill, toStatus } from '@/components/status'

interface LeadForm {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  submitCount: number
  headline?: string | null
  description?: string | null
}

export default function FormsPage() {
  const router = useRouter()
  const toast = useToast()
  const [forms, setForms] = useState<LeadForm[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api
      .get<LeadForm[]>('/lead-forms')
      .then(setForms)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [])
  useEffect(load, [load])

  function publicUrl(slug: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/f/${slug}`
  }

  async function copyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug))
      toast.push('success', 'Public link copied')
    } catch {
      toast.push('error', 'Could not copy link')
    }
  }

  return (
    <>
      <PageHeader
        title="Lead capture forms"
        subtitle="Build hosted forms, share their link, and turn submissions into leads"
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New form
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !forms ? (
        <TableSkeleton cols={3} />
      ) : forms.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No forms yet"
          hint="Create your first lead capture form, publish it, and share the link anywhere."
        />
      ) : (
        <Stagger className="stack" interval={0.05} style={{ gap: 10 }}>
          {forms.map((f) => (
            <StaggerItem key={f.id} className="card" style={{ padding: 14 }}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <button
                  className="stack"
                  style={{
                    gap: 4,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: 'none',
                    border: 0,
                    padding: 0,
                  }}
                  onClick={() => router.push(`/app/marketing/forms/${f.id}`)}
                >
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{f.name}</span>
                    <StatusPill status={toStatus(f.status)} />
                  </div>
                  <span className="dim" style={{ fontSize: 12 }}>
                    {f.submitCount} submission{f.submitCount === 1 ? '' : 's'}
                  </span>
                </button>
                <Link className="btn ghost sm" href={`/app/marketing/forms/${f.id}`}>
                  Edit →
                </Link>
              </div>

              {f.status === 'PUBLISHED' ? (
                <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                  <input
                    className="input grow"
                    readOnly
                    value={publicUrl(f.slug)}
                    style={{ fontSize: 12 }}
                  />
                  <button className="btn sm" onClick={() => void copyLink(f.slug)}>
                    Copy link
                  </button>
                  <a
                    className="btn ghost sm"
                    href={publicUrl(f.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </div>
              ) : null}
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {creating ? (
        <CreateFormDrawer
          busy={false}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            try {
              const form = await api.post<LeadForm>('/lead-forms', input)
              toast.push('success', 'Form created')
              setCreating(false)
              router.push(`/app/marketing/forms/${form.id}`)
            } catch (e) {
              toast.push('error', e instanceof ApiError ? e.message : 'Could not create form')
            }
          }}
        />
      ) : null}
    </>
  )
}

function CreateFormDrawer({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean
  onClose: () => void
  onCreate: (input: { name: string; headline?: string; description?: string }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (name.trim().length === 0) return
    setSaving(true)
    await onCreate({
      name: name.trim(),
      ...(headline.trim() ? { headline: headline.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    })
    setSaving(false)
  }

  return (
    <Drawer
      open
      title="New lead form"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || saving || name.trim().length === 0}
            onClick={() => void submit()}
          >
            {saving ? <Spinner /> : 'Create form'}
          </button>
        </>
      }
    >
      <Field label="Name">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contact us"
        />
      </Field>
      <Field label="Headline" hint="Shown at the top of the hosted form">
        <input
          className="input"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Get in touch"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </Drawer>
  )
}
