'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { FadeIn } from '@/components/motion'
import { Icon } from '@/components/icon'
import { Field } from '@/components/ui'

/**
 * The brand kit.
 *
 * Everything a poster needs to come out right, in one place. It divides in two,
 * and the halves do genuinely different jobs:
 *
 *   Facts  — logo, phone numbers, email, offices, services. These get typeset
 *            onto the artwork by the system. No image model can be trusted to
 *            draw a phone number, so these are never generated.
 *   Story  — tagline, voice, audience. These shape what the AI writes.
 *
 * Facts live on `/config/branding`, story on `/organization/settings`. Two
 * endpoints, one screen, because "where do I put my phone number" should have a
 * single answer.
 */

interface LabelledValue {
  label: string
  value: string
}

interface BrandKit {
  displayName?: string | null
  logoUrl?: string | null
  contactEmail?: string | null
  contactPhones?: LabelledValue[] | null
  offices?: LabelledValue[] | null
  services?: string[] | null
  disclaimers?: LabelledValue[] | null
  bannedClaims?: string[] | null
}

interface BrandStory {
  tagline?: string | null
  brandVoice?: string | null
  targetAudience?: string | null
}

/** A repeating list of labelled facts — "USA" / "+1 317 449 2654". */
function LabelledList({
  label,
  hint,
  rows,
  labelPlaceholder,
  valuePlaceholder,
  onChange,
}: {
  label: string
  hint: string
  rows: LabelledValue[]
  labelPlaceholder: string
  valuePlaceholder: string
  onChange: (rows: LabelledValue[]) => void
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label className="type-label" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <p className="type-caption" style={{ color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
        {hint}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, i) => (
          <div key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input
              className="input"
              style={{ maxWidth: 140 }}
              value={row.label}
              placeholder={labelPlaceholder}
              aria-label={`${label} — label ${String(i + 1)}`}
              onChange={(e) => {
                const next = [...rows]
                next[i] = { label: e.target.value, value: row.value }
                onChange(next)
              }}
            />
            <input
              className="input"
              value={row.value}
              placeholder={valuePlaceholder}
              aria-label={`${label} — value ${String(i + 1)}`}
              onChange={(e) => {
                const next = [...rows]
                next[i] = { label: row.label, value: e.target.value }
                onChange(next)
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${label} ${String(i + 1)}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn sm"
        style={{ marginTop: 10 }}
        onClick={() => onChange([...rows, { label: '', value: '' }])}
      >
        <Icon name="plus" size={13} /> Add
      </button>
    </div>
  )
}

/** A comma-separated list, edited as one field because that is how people type them. */
function TagListField({
  label,
  hint,
  placeholder,
  values,
  onChange,
}: {
  label: string
  hint: string
  placeholder: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="input"
        value={values.join(', ')}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0),
          )
        }
      />
    </Field>
  )
}

export default function BrandKitPage() {
  const toast = useToast()
  const [kit, setKit] = useState<BrandKit>({})
  const [story, setStory] = useState<BrandStory>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [b, org] = await Promise.all([
        api.get<BrandKit>('/config/branding'),
        api
          .get<{ settings?: BrandStory }>('/organization')
          .catch(() => ({ settings: {} }) as { settings?: BrandStory }),
      ])
      setKit({
        displayName: b?.displayName ?? '',
        logoUrl: b?.logoUrl ?? '',
        contactEmail: b?.contactEmail ?? '',
        contactPhones: b?.contactPhones ?? [],
        offices: b?.offices ?? [],
        services: b?.services ?? [],
        disclaimers: b?.disclaimers ?? [],
        bannedClaims: b?.bannedClaims ?? [],
      })
      setStory({
        tagline: org?.settings?.tagline ?? '',
        brandVoice: org?.settings?.brandVoice ?? '',
        targetAudience: org?.settings?.targetAudience ?? '',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your brand kit')
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
      // Only send what carries a value — the API's url and email validators
      // reject empty strings, and blank rows are just unfinished edits.
      const clean = (rows: LabelledValue[] | null | undefined) =>
        (rows ?? []).filter((r) => r.value.trim().length > 0)

      const body: Record<string, unknown> = {
        contactPhones: clean(kit.contactPhones),
        offices: clean(kit.offices),
        disclaimers: clean(kit.disclaimers),
        services: kit.services ?? [],
        bannedClaims: kit.bannedClaims ?? [],
      }
      if (kit.displayName) body['displayName'] = kit.displayName
      if (kit.logoUrl) body['logoUrl'] = kit.logoUrl
      if (kit.contactEmail) body['contactEmail'] = kit.contactEmail

      await Promise.all([
        api.put('/config/branding', body),
        api.patch('/organization/settings', {
          tagline: story.tagline ?? '',
          brandVoice: story.brandVoice ?? '',
          targetAudience: story.targetAudience ?? '',
        }),
      ])
      toast.push('success', 'Brand kit saved — new posters will use it')
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Brand kit"
        subtitle="Fill this in once. Every poster from now on carries the right logo, the right number and the right wording."
      />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="stack" style={{ gap: 20, maxWidth: 720 }}>
          <FadeIn className="card">
            <h2 className="type-section" style={{ marginBottom: 4 }}>
              Your details
            </h2>
            <p
              className="type-secondary"
              style={{ color: 'var(--text-secondary)', marginBottom: 20 }}
            >
              These are printed onto your posters exactly as written here — never drawn by the AI,
              so a phone number is never wrong.
            </p>

            <Field label="Business name">
              <input
                className="input"
                value={kit.displayName ?? ''}
                placeholder="VSP Law Associates"
                onChange={(e) => setKit({ ...kit, displayName: e.target.value })}
              />
            </Field>

            <Field label="Logo URL" hint="Placed on posters and shown beside your workspace name.">
              <input
                className="input"
                value={kit.logoUrl ?? ''}
                placeholder="https://example.com/logo.png"
                onChange={(e) => setKit({ ...kit, logoUrl: e.target.value })}
              />
            </Field>

            <Field label="Email">
              <input
                className="input"
                type="email"
                value={kit.contactEmail ?? ''}
                placeholder="info@vsplawassociates.com"
                onChange={(e) => setKit({ ...kit, contactEmail: e.target.value })}
              />
            </Field>

            <LabelledList
              label="Phone numbers"
              hint="Label each one by country. A campaign aimed at India gets the India number."
              labelPlaceholder="India"
              valuePlaceholder="+91 9908411129"
              rows={kit.contactPhones ?? []}
              onChange={(rows) => setKit({ ...kit, contactPhones: rows })}
            />

            <LabelledList
              label="Offices"
              hint="Where you practise. Used on posters and in local campaigns."
              labelPlaceholder="Dallas"
              valuePlaceholder="6300 Flyers Way, Frisco, TX"
              rows={kit.offices ?? []}
              onChange={(rows) => setKit({ ...kit, offices: rows })}
            />

            <TagListField
              label="Services you offer"
              hint="Separate with commas. These become the service list on flyers."
              placeholder="Business Law, Immigration Support, Family Law"
              values={kit.services ?? []}
              onChange={(values) => setKit({ ...kit, services: values })}
            />
          </FadeIn>

          <FadeIn delay={0.06} className="card">
            <h2 className="type-section" style={{ marginBottom: 4 }}>
              How you sound
            </h2>
            <p
              className="type-secondary"
              style={{ color: 'var(--text-secondary)', marginBottom: 20 }}
            >
              This shapes the words the AI writes — captions, headlines and ad copy.
            </p>

            <Field label="Tagline">
              <input
                className="input"
                value={story.tagline ?? ''}
                placeholder="Trusted legal solutions across the USA, Canada and India"
                onChange={(e) => setStory({ ...story, tagline: e.target.value })}
              />
            </Field>

            <Field label="Brand voice" hint="How your AI should sound when writing for you.">
              <textarea
                className="input"
                rows={3}
                value={story.brandVoice ?? ''}
                placeholder="Professional, reassuring, plain-spoken. Never salesy."
                onChange={(e) => setStory({ ...story, brandVoice: e.target.value })}
              />
            </Field>

            <Field label="Who you are trying to reach">
              <textarea
                className="input"
                rows={3}
                value={story.targetAudience ?? ''}
                placeholder="NRI families in the USA and Canada with legal matters in India."
                onChange={(e) => setStory({ ...story, targetAudience: e.target.value })}
              />
            </Field>
          </FadeIn>

          <FadeIn delay={0.12} className="card">
            <h2 className="type-section" style={{ marginBottom: 4 }}>
              Advertising rules
            </h2>
            <p
              className="type-secondary"
              style={{ color: 'var(--text-secondary)', marginBottom: 20 }}
            >
              Regulated professions advertise under different rules in each country. Set them once
              and the system applies them, so nobody has to remember.
            </p>

            <LabelledList
              label="Disclaimers"
              hint="Stamped onto posters aimed at that region."
              labelPlaceholder="India"
              valuePlaceholder="This is not an advertisement or solicitation."
              rows={kit.disclaimers ?? []}
              onChange={(rows) => setKit({ ...kit, disclaimers: rows })}
            />

            <TagListField
              label="Words never to claim"
              hint="Copy containing these is flagged before it can publish. Separate with commas."
              placeholder="best, guaranteed, number one, win your case"
              values={kit.bannedClaims ?? []}
              onChange={(values) => setKit({ ...kit, bannedClaims: values })}
            />
          </FadeIn>

          <div className="row">
            <button
              type="button"
              className="btn primary"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save brand kit'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
