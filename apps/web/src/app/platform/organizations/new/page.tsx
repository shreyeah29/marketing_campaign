'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import { closeDependencies, enabledDependentsOf, indexFeatures } from '@/lib/features'
import { platform } from '@/lib/platform'
import type { Catalog, ProvisionInput } from '@/lib/types'
import { Badge, Banner, Field, LoadingScreen, Spinner } from '@/components/ui'

type Step = 1 | 2 | 3

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Company' },
  { n: 2, label: 'Admin user' },
  { n: 3, label: 'Plan & modules' },
]

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

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [industry, setIndustry] = useState('')

  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  const [plan, setPlan] = useState<string>('growth')
  const [preset, setPreset] = useState<string | null>(null)
  const [features, setFeatures] = useState<Set<string>>(new Set())

  useEffect(() => {
    platform
      .catalog()
      .then((c) => {
        setCatalog(c)
        // Seed the feature selection from the default plan.
        const p = c.plans.find((x) => x.id === 'growth') ?? c.plans[0]
        if (p) {
          setPlan(p.id)
          setFeatures(new Set(p.featureIds))
        }
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

  function applyPlan(planId: string) {
    setPlan(planId)
    setPreset(null)
    const p = catalog!.plans.find((x) => x.id === planId)
    if (p) setFeatures(closeDependencies(p.featureIds, index!))
  }

  function applyPreset(presetId: string) {
    const p = catalog!.presets.find((x) => x.id === presetId)
    if (!p) return
    setPreset(presetId)
    setPlan(p.recommendedPlan)
    setFeatures(closeDependencies(p.featureIds, index!))
  }

  function toggleFeature(id: string, on: boolean) {
    setPreset(null) // a manual edit means it is no longer a pristine template
    setFeatures((prev) => {
      const next = new Set(prev)
      if (on) {
        // Pull in dependencies.
        for (const dep of closeDependencies([id], index!)) next.add(dep)
      } else {
        // Refuse to remove a feature that enabled features still depend on.
        const blockers = enabledDependentsOf(id, next, index!)
        if (blockers.length > 0) return prev
        next.delete(id)
      }
      return next
    })
  }

  const step1Valid = name.trim().length > 0 && /^[a-z0-9-]{2,63}$/.test(effectiveSlug)
  const step2Valid =
    adminName.trim().length > 0 && /^[^@]+@[^@]+\.[^@]+$/.test(adminEmail) && adminPassword.length >= 8

  async function submit() {
    if (!step1Valid || !step2Valid) return
    setBusy(true)
    setSubmitError(null)
    const input: ProvisionInput = {
      company: { name: name.trim(), slug: effectiveSlug, ...(industry ? { industry } : {}) },
      admin: { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword },
      plan,
      status: 'TRIAL',
      // The checked set is the truth; send it explicitly rather than the preset so
      // the operator's tweaks (including removals) are honoured exactly.
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
          <h1 className="page-title">New organization</h1>
          <p className="page-sub">
            One wizard provisions a fully-configured client — company, admin, plan, modules — with no
            code.
          </p>
        </div>
        <Link href="/platform" className="btn ghost">
          Cancel
        </Link>
      </div>

      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.n} className={`step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
            <span className="num">{step > s.n ? '✓' : s.n}</span>
            {s.label}
          </div>
        ))}
      </div>

      {submitError ? <Banner kind="error">{submitError}</Banner> : null}

      {/* ── Step 1: Company ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: 640 }}>
          <Field label="Company name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Legal LLP"
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
              placeholder="acme-legal"
            />
          </Field>
          <Field label="Industry" hint="Optional. Helps suggest an industry template next.">
            <input
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="Legal services"
            />
          </Field>
          <div className="spread mt">
            <span />
            <button className="btn primary" disabled={!step1Valid} onClick={() => setStep(2)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Admin user ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="card" style={{ maxWidth: 640 }}>
          <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
            This person becomes the organization <strong>OWNER</strong> — the first admin account,
            usable the moment they sign in.
          </p>
          <Field label="Full name">
            <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </Field>
          <Field label="Temporary password" hint="At least 8 characters. Stored hashed, never in plaintext.">
            <input
              className="input"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </Field>
          <div className="spread mt">
            <button className="btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn primary" disabled={!step2Valid} onClick={() => setStep(3)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Plan & modules ──────────────────────────────────────────── */}
      {step === 3 && (
        <div className="stack">
          {/* Industry templates */}
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Start from an industry template</h3>
            <p className="dim" style={{ marginBottom: 14, fontSize: 12 }}>
              Optional. Pre-selects a tuned module set and recommended plan — then tweak below.
            </p>
            <div className="grid cols-3">
              {catalog.presets.map((p) => (
                <button
                  key={p.id}
                  className="card"
                  style={{
                    textAlign: 'left',
                    borderColor: preset === p.id ? 'var(--color-primary)' : 'var(--border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => applyPreset(p.id)}
                >
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="dim" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    {p.description}
                  </div>
                  <span className="badge">{p.featureCount} modules</span>
                </button>
              ))}
            </div>
          </div>

          {/* Plan */}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Plan</h3>
            <div className="grid cols-4">
              {catalog.plans.map((p) => (
                <button
                  key={p.id}
                  className="card"
                  style={{
                    textAlign: 'left',
                    borderColor: plan === p.id ? 'var(--color-primary)' : 'var(--border)',
                    cursor: 'pointer',
                  }}
                  onClick={() => applyPlan(p.id)}
                >
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className="v" style={{ fontSize: 18, margin: '6px 0' }}>
                    {p.customPricing
                      ? 'Custom'
                      : p.monthlyPriceUsd === null
                        ? 'Free'
                        : `$${p.monthlyPriceUsd}/mo`}
                  </div>
                  <span className="dim" style={{ fontSize: 11 }}>
                    {p.featureCount} modules
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div className="card">
            <div className="spread" style={{ marginBottom: 12 }}>
              <h3>Modules</h3>
              <Badge status="info">{features.size} enabled</Badge>
            </div>
            <p className="dim" style={{ marginBottom: 14, fontSize: 12 }}>
              Enable exactly the modules this client should have. Dependencies are pulled in
              automatically; a module another enabled module needs cannot be turned off.
            </p>
            {catalog.features.map((group) => {
              const enabledInCat = group.features.filter((f) => features.has(f.id)).length
              return (
                <details key={group.category} className="cat" open={enabledInCat > 0}>
                  <summary>
                    <span style={{ textTransform: 'capitalize' }}>
                      {group.category.replace(/_/g, ' ')}
                    </span>
                    <span className="dim" style={{ fontSize: 12 }}>
                      {enabledInCat}/{group.features.length}
                    </span>
                  </summary>
                  <div className="cat-body">
                    {group.features.map((f) => {
                      const on = features.has(f.id)
                      const blockers = on ? enabledDependentsOf(f.id, features, index) : []
                      const locked = blockers.length > 0
                      return (
                        <label key={f.id} className="feat">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked}
                            onChange={(e) => toggleFeature(f.id, e.target.checked)}
                          />
                          <span>
                            <span className="fname">{f.name}</span>
                            <div className="fdesc">{f.description}</div>
                            {f.dependencies.length > 0 && (
                              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                                needs: {f.dependencies.map((d) => index.names.get(d) ?? d).join(', ')}
                              </div>
                            )}
                            {locked && (
                              <div className="dep-note">
                                required by {blockers.map((b) => index.names.get(b) ?? b).join(', ')}
                              </div>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </details>
              )
            })}
          </div>

          <div className="spread">
            <button className="btn ghost" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="btn primary" disabled={busy || features.size === 0} onClick={submit}>
              {busy ? <Spinner /> : `Provision "${name || 'organization'}"`}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
