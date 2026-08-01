'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { Field } from '@/components/ui'

interface OrgSettings {
  tagline?: string | null
  brandVoice?: string | null
  targetAudience?: string | null
}

interface Organization {
  id: string
  name: string
  slug: string
  industry?: string | null
  website?: string | null
  timezone?: string | null
  plan?: string | null
  settings?: OrgSettings | null
}

export default function OrganizationSettingsPage() {
  const toast = useToast()
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<OrgSettings>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<Organization>('/organization')
      setOrg(res)
      setForm({
        tagline: res?.settings?.tagline ?? '',
        brandVoice: res?.settings?.brandVoice ?? '',
        targetAudience: res?.settings?.targetAudience ?? '',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organization')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    try {
      // Profile settings live under the settings sub-resource; name/slug/timezone
      // are managed through provisioning and are read-only here.
      await api.patch('/organization/settings', {
        tagline: form.tagline || null,
        brandVoice: form.brandVoice || null,
        targetAudience: form.targetAudience || null,
      })
      toast.push('success', 'Organization updated')
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Organization" subtitle="Your workspace profile and brand settings" />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="card" style={{ maxWidth: 640 }}>
          <div className="cols-2 grid" style={{ marginBottom: 18 }}>
            <Field label="Name">
              <input className="input" value={org?.name ?? ''} disabled />
            </Field>
            <Field label="Industry">
              <input className="input" value={org?.industry ?? '—'} disabled />
            </Field>
            <Field label="Timezone">
              <input className="input" value={org?.timezone ?? '—'} disabled />
            </Field>
            <Field label="Plan">
              <input className="input" value={org?.plan ?? '—'} disabled />
            </Field>
          </div>

          <Field label="Tagline" hint="A short line that captures your brand.">
            <input
              className="input"
              value={form.tagline ?? ''}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="Marketing on autopilot"
            />
          </Field>
          <Field label="Brand voice" hint="How your AI should sound when writing for you.">
            <textarea
              className="input"
              rows={3}
              value={form.brandVoice ?? ''}
              onChange={(e) => setForm({ ...form, brandVoice: e.target.value })}
              placeholder="Friendly, confident, concise."
            />
          </Field>
          <Field label="Target audience" hint="Who you are trying to reach.">
            <textarea
              className="input"
              rows={3}
              value={form.targetAudience ?? ''}
              onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
              placeholder="Small business owners in retail."
            />
          </Field>

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
