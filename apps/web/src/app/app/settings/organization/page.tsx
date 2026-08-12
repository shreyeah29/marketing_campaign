'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Field } from '@/components/ui'
import { MetaConnectCard } from '@/components/meta-connect'

interface OrgSettings {
  tagline?: string | null
  brandVoice?: string | null
  targetAudience?: string | null
  monthlyReportEnabled?: boolean
  reportRecipientEmail?: string | null
  leadAutoReplyEnabled?: boolean
  leadAutoReplyTemplate?: string | null
  leadAutoReplyLanguage?: string | null
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
        monthlyReportEnabled: res?.settings?.monthlyReportEnabled ?? false,
        reportRecipientEmail: res?.settings?.reportRecipientEmail ?? '',
        leadAutoReplyEnabled: res?.settings?.leadAutoReplyEnabled ?? false,
        leadAutoReplyTemplate: res?.settings?.leadAutoReplyTemplate ?? '',
        leadAutoReplyLanguage: res?.settings?.leadAutoReplyLanguage ?? 'en_US',
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
        monthlyReportEnabled: form.monthlyReportEnabled ?? false,
        reportRecipientEmail: form.reportRecipientEmail?.trim() || null,
        leadAutoReplyEnabled: form.leadAutoReplyEnabled ?? false,
        leadAutoReplyTemplate: form.leadAutoReplyTemplate?.trim() || null,
        leadAutoReplyLanguage: form.leadAutoReplyLanguage?.trim() || null,
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
        <FadeIn delay={0.12} className="card" style={{ maxWidth: 640 }}>
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

          {/* Monthly report — composed and sent by the worker on the 1st. */}
          <div
            style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}
          >
            <label className="row" style={{ gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.monthlyReportEnabled ?? false}
                onChange={(e) => setForm({ ...form, monthlyReportEnabled: e.target.checked })}
              />
              <span>Email a monthly performance report</span>
            </label>
            {form.monthlyReportEnabled ? (
              <Field label="Report recipient" hint="Leave empty to send it to the workspace owner.">
                <input
                  className="input"
                  type="email"
                  value={form.reportRecipientEmail ?? ''}
                  onChange={(e) => setForm({ ...form, reportRecipientEmail: e.target.value })}
                  placeholder="reports@yourcompany.com"
                />
              </Field>
            ) : null}
          </div>

          {/* Speed to lead — sent by the worker seconds after a form comes in. */}
          <div
            style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 16 }}
          >
            <label className="row" style={{ gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={form.leadAutoReplyEnabled ?? false}
                onChange={(e) => setForm({ ...form, leadAutoReplyEnabled: e.target.checked })}
              />
              <span>WhatsApp every new lead the moment they enquire</span>
            </label>
            <p
              className="type-caption"
              style={{ color: 'var(--text-tertiary)', margin: '0 0 12px 24px' }}
            >
              Replying within a minute is the difference between a conversation and a missed one.
            </p>

            {form.leadAutoReplyEnabled ? (
              <>
                <Field
                  label="Approved template name"
                  hint="WhatsApp only allows pre-approved templates for a message you send first. Create one in Meta Business Manager, wait for approval, then paste its exact name here. Give it a single {{1}} placeholder — we fill it with the lead's first name."
                >
                  <input
                    className="input"
                    value={form.leadAutoReplyTemplate ?? ''}
                    onChange={(e) => setForm({ ...form, leadAutoReplyTemplate: e.target.value })}
                    placeholder="lead_welcome"
                  />
                </Field>
                <Field
                  label="Template language"
                  hint="Exactly as Meta lists it — en_US, hi_IN, te_IN."
                >
                  <input
                    className="input"
                    value={form.leadAutoReplyLanguage ?? ''}
                    onChange={(e) => setForm({ ...form, leadAutoReplyLanguage: e.target.value })}
                    placeholder="en_US"
                  />
                </Field>
                <p className="type-caption" style={{ color: 'var(--text-tertiary)', margin: 0 }}>
                  Needs a connected WhatsApp number on your Meta connection below. Leads without a
                  phone number are skipped.
                </p>
              </>
            ) : null}
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </FadeIn>
      )}

      {/* Channel connections — Meta powers ads, lead capture and insights. */}
      <FadeIn delay={0.18}>
        <MetaConnectCard />
      </FadeIn>
    </>
  )
}
