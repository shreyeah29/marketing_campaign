'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Field } from '@/components/ui'

/**
 * White-labelling is logo + display name (owner decision, 2026-08-02). The
 * `/config/branding` contract still carries colour fields; this screen no longer
 * reads or sends them, so stored values stay put and stop affecting the UI.
 */
interface Branding {
  displayName?: string | null
  logoUrl?: string | null
  loginTagline?: string | null
}

export default function BrandingSettingsPage() {
  const toast = useToast()
  const [form, setForm] = useState<Branding>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const b = await api.get<Branding>('/config/branding')
      setForm({
        displayName: b?.displayName ?? '',
        logoUrl: b?.logoUrl ?? '',
        loginTagline: b?.loginTagline ?? '',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load branding')
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
      // Only send fields that carry a value; empty strings would fail the API's
      // url/hex validators.
      const body: Record<string, string> = {}
      if (form.displayName) body['displayName'] = form.displayName
      if (form.logoUrl) body['logoUrl'] = form.logoUrl
      if (form.loginTagline) body['loginTagline'] = form.loginTagline
      await api.put('/config/branding', body)
      toast.push('success', 'Branding updated')
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Branding" subtitle="White-label the workspace for your organization" />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <FadeIn delay={0.12} className="card" style={{ maxWidth: 640 }}>
          <Field label="Display name">
            <input
              className="input"
              value={form.displayName ?? ''}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Acme Marketing"
            />
          </Field>
          <Field label="Logo URL" hint="Shown beside your workspace name in the sidebar">
            <input
              className="input"
              value={form.logoUrl ?? ''}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://cdn.example.com/logo.png"
            />
          </Field>
          <Field label="Login tagline">
            <input
              className="input"
              value={form.loginTagline ?? ''}
              onChange={(e) => setForm({ ...form, loginTagline: e.target.value })}
              placeholder="Welcome back"
            />
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </FadeIn>
      )}
    </>
  )
}
