'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { closeDependencies, enabledDependentsOf, indexFeatures } from '@/lib/features'
import { platform } from '@/lib/platform'
import type { Catalog, ProvisionInput } from '@/lib/types'
import { Banner, Field, LoadingScreen, Spinner } from '@/components/ui'
import { Icon, type IconName } from '@/components/icon'
import { FadeIn } from '@/components/motion'
import { Chip } from '@/components/status'

type Step = 1 | 2 | 3 | 4

const MODULE_ICONS: Record<string, IconName> = {
  Marketing: 'megaphone',
  Analytics: 'bar-chart',
  CRM: 'users',
  AI: 'sparkles',
  Automation: 'workflow',
  Support: 'life-buoy',
  Documents: 'folder',
  Inbox: 'inbox',
  Commerce: 'credit-card',
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Company' },
  { n: 2, label: 'Brand & vision' },
  { n: 3, label: 'Admin user' },
  { n: 4, label: 'Modules' },
]

/** Keep logo uploads well under the API's 1MB body limit. */
const MAX_LOGO_BYTES = 400 * 1024

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

export default function NewOrganizationPage() {
  const router = useRouter()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>(1)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ── Company ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [industry, setIndustry] = useState('')
  const [website, setWebsite] = useState('')
  const [registeredYear, setRegisteredYear] = useState('')
  const [description, setDescription] = useState('')

  // ── Brand & vision ───────────────────────────────────────────────────────────
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [tagline, setTagline] = useState('')
  const [vision, setVision] = useState('')
  const [targetAudience, setTargetAudience] = useState('')

  // ── Admin ────────────────────────────────────────────────────────────────────
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  // ── Modules ──────────────────────────────────────────────────────────────────
  const [features, setFeatures] = useState<Set<string>>(new Set())

  useEffect(() => {
    platform
      .catalog()
      .then((c) => {
        setCatalog(c)
        // Seed with the registry's sensible defaults; the operator tweaks from there.
        const defaults = c.features.flatMap((g) =>
          g.features.filter((f) => f.defaultEnabled).map((f) => f.id),
        )
        setFeatures(new Set(defaults))
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/platform/login')
          return
        }
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load catalog')
      })
  }, [router])

  const index = useMemo(() => (catalog ? indexFeatures(catalog.features) : null), [catalog])

  if (loadError) return <Banner kind="error">{loadError}</Banner>
  if (!catalog || !index) return <LoadingScreen />

  const effectiveSlug = slugTouched ? slug : slugify(name)

  function onLogoFile(file: File | undefined) {
    setLogoError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('Please choose an image file (PNG, JPG or SVG).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo must be under 400 KB. Export a smaller version and try again.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  function toggleFeature(id: string, on: boolean) {
    setFeatures((prev) => {
      const next = new Set(prev)
      if (on) {
        for (const dep of closeDependencies([id], index!)) next.add(dep)
      } else {
        const blockers = enabledDependentsOf(id, next, index!)
        if (blockers.length > 0) return prev
        next.delete(id)
      }
      return next
    })
  }

  const step1Valid = name.trim().length > 0 && /^[a-z0-9-]{2,63}$/.test(effectiveSlug)
  const step3Valid =
    adminName.trim().length > 0 &&
    /^[^@]+@[^@]+\.[^@]+$/.test(adminEmail) &&
    adminPassword.length >= 8

  async function submit() {
    if (!step1Valid || !step3Valid) return
    setBusy(true)
    setSubmitError(null)
    const year = Number.parseInt(registeredYear, 10)
    // The API validates website as a full URL — people type "acme.com", so add
    // the scheme for them rather than bouncing the form.
    const site = website.trim()
    const normalizedSite = site && !/^https?:\/\//i.test(site) ? `https://${site}` : site
    const input: ProvisionInput = {
      company: {
        name: name.trim(),
        slug: effectiveSlug,
        ...(industry.trim() ? { industry: industry.trim() } : {}),
        ...(normalizedSite ? { website: normalizedSite } : {}),
        ...(Number.isFinite(year) && year >= 1800 && year <= 2100 ? { registeredYear: year } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
      },
      profile: {
        ...(vision.trim() ? { vision: vision.trim() } : {}),
        ...(targetAudience.trim() ? { targetAudience: targetAudience.trim() } : {}),
        ...(tagline.trim() ? { tagline: tagline.trim() } : {}),
      },
      branding: {
        displayName: name.trim(),
        ...(logoDataUrl ? { logoUrl: logoDataUrl } : {}),
      },
      admin: { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword },
      status: 'TRIAL',
      features: [...features],
    }
    try {
      const result = await platform.provision(input)
      router.push(`/platform/organizations/${result.organizationId}?provisioned=1`)
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Provisioning failed')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="page-title">Onboard a client</h1>
          <p className="page-sub">
            A proper onboarding session — who they are, their brand, their people, their modules.
          </p>
        </div>
        <Link href="/platform" className="btn ghost">
          Cancel
        </Link>
      </div>

      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.n} className={`step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
            <span className="num">{step > s.n ? <Icon name="check" size={12} /> : s.n}</span>
            {s.label}
          </div>
        ))}
      </div>

      {submitError ? <Banner kind="error">{submitError}</Banner> : null}

      {/* ── Step 1: Company ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <FadeIn className="card" style={{ maxWidth: 680 }}>
          <Field label="Company name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lumen Bulbs Co."
            />
          </Field>
          <Field label="Slug" hint="Used for the tenant's subdomain. Lowercase, numbers, hyphens.">
            <input
              className="input mono"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value)
              }}
              placeholder="lumen-bulbs"
            />
          </Field>
          <div className="cols-2 grid" style={{ gap: 14 }}>
            <Field label="Industry">
              <input
                className="input"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Consumer lighting"
              />
            </Field>
            <Field label="Registered year">
              <input
                className="input"
                inputMode="numeric"
                value={registeredYear}
                onChange={(e) => setRegisteredYear(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="2014"
              />
            </Field>
          </div>
          <Field label="Website">
            <input
              className="input"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://lumenbulbs.com"
            />
          </Field>
          <Field
            label="About the company"
            hint="What they do, what they sell, what makes them different. The AI reads this."
          >
            <textarea
              className="input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Family-run LED bulb manufacturer selling D2C and through retail chains…"
            />
          </Field>
          <div className="spread mt">
            <span />
            <button className="btn primary" disabled={!step1Valid} onClick={() => setStep(2)}>
              Continue <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </FadeIn>
      )}

      {/* ── Step 2: Brand & vision ──────────────────────────────────────────── */}
      {step === 2 && (
        <FadeIn className="card" style={{ maxWidth: 680 }}>
          <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
            Everything here feeds content generation: the logo lands on generated posters, the
            vision shapes every caption and email.
          </p>

          <Field label="Company logo" hint="PNG, JPG or SVG, up to 400 KB.">
            <div className="row" style={{ gap: 14 }}>
              <label className="btn" style={{ cursor: 'pointer' }} aria-label="Upload company logo">
                <Icon name="upload" size={15} />
                {logoDataUrl ? 'Replace logo' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                />
              </label>
              {logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoDataUrl}
                  alt="Logo preview"
                  style={{
                    height: 48,
                    maxWidth: 160,
                    objectFit: 'contain',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-raised)',
                    padding: 6,
                  }}
                />
              ) : null}
            </div>
            {logoError ? (
              <span style={{ color: 'var(--crimson-600)', fontSize: 12 }}>{logoError}</span>
            ) : null}
          </Field>

          <Field label="Tagline" hint="One line that captures them.">
            <input
              className="input"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Light that lasts."
            />
          </Field>

          <Field
            label="Company vision & story"
            hint="Their mission, values, story. Woven into every piece of generated content."
          >
            <textarea
              className="input"
              rows={4}
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder="We believe great light shouldn't cost the earth…"
            />
          </Field>

          <Field label="Target audience" hint="Who their marketing should speak to.">
            <textarea
              className="input"
              rows={3}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Homeowners 28–55 renovating on a budget; facility managers…"
            />
          </Field>

          <div className="spread mt">
            <button className="btn ghost" onClick={() => setStep(1)}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn primary" onClick={() => setStep(3)}>
              Continue <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </FadeIn>
      )}

      {/* ── Step 3: Admin user ──────────────────────────────────────────────── */}
      {step === 3 && (
        <FadeIn className="card" style={{ maxWidth: 680 }}>
          <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
            This person becomes the organization <strong>OWNER</strong> — the first admin account,
            usable the moment they sign in.
          </p>
          <Field label="Full name">
            <input
              className="input"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Temporary password"
            hint="At least 8 characters. Stored hashed, never in plaintext."
          >
            <input
              className="input"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </Field>
          <div className="spread mt">
            <button className="btn ghost" onClick={() => setStep(2)}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn primary" disabled={!step3Valid} onClick={() => setStep(4)}>
              Continue <Icon name="chevron-right" size={14} />
            </button>
          </div>
        </FadeIn>
      )}

      {/* ── Step 4: Modules ─────────────────────────────────────────────────── */}
      {step === 4 && (
        <FadeIn className="stack">
          <div className="card">
            <div className="spread" style={{ marginBottom: 12 }}>
              <h3 className="type-section">Assign modules</h3>
              <Chip>{features.size} enabled</Chip>
            </div>
            <p className="dim" style={{ marginBottom: 14, fontSize: 12 }}>
              Configure this workspace by enabling core services. Dependencies are pulled in
              automatically, and a module another enabled module needs cannot be switched off.
            </p>
            {catalog.features.map((group) => (
              <div key={group.category} style={{ marginBottom: 'var(--space-6)' }}>
                <div className="module-card__eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
                  {group.category.replace(/_/g, ' ')}
                </div>
                {group.features.map((f) => {
                  const on = features.has(f.id)
                  // A module another enabled module depends on cannot be switched
                  // off — that combination is exactly what refuses to boot.
                  const blockers = on ? enabledDependentsOf(f.id, features, index) : []
                  const locked = blockers.length > 0
                  return (
                    <div
                      key={f.id}
                      className="module-card"
                      {...(locked ? { 'data-locked': '' } : {})}
                    >
                      <span className="module-card__icon" aria-hidden>
                        <Icon name={MODULE_ICONS[group.category] ?? 'grid'} size={20} />
                      </span>
                      <div className="module-card__body">
                        <div className="module-card__title">{f.name}</div>
                        <p className="module-card__desc">{f.description}</p>
                        {f.dependencies.length > 0 ? (
                          <p className="module-card__note">
                            Needs {f.dependencies.map((d) => index.names.get(d) ?? d).join(', ')}
                          </p>
                        ) : null}
                        {locked ? (
                          <p className="module-card__note">
                            Required by {blockers.map((b) => index.names.get(b) ?? b).join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          aria-label={`Enable ${f.name}`}
                          onChange={(e) => toggleFeature(f.id, e.target.checked)}
                        />
                        <span className="switch__track" />
                        <span className="switch__knob">
                          {on ? <Icon name="check" size={13} /> : null}
                        </span>
                      </label>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="spread">
            <button className="btn ghost" onClick={() => setStep(3)}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn primary" disabled={busy || features.size === 0} onClick={submit}>
              {busy ? <Spinner /> : `Onboard "${name || 'client'}"`}
            </button>
          </div>
        </FadeIn>
      )}
    </>
  )
}
