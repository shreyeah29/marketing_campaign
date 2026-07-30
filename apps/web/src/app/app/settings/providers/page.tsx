'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { EmptyState, ErrorState, PageHeader, TableSkeleton, useToast } from '@/components/kit'
import { Badge, Field } from '@/components/ui'

interface ProviderOption {
  id: string
  name: string
  recommended: boolean
  credentialFields: string[]
}

interface CapabilityConfig {
  capability: string
  options: ProviderOption[]
  selected: string | null
  credentialConfigured: boolean
}

function CapabilityCard({ cap, onSaved }: { cap: CapabilityConfig; onSaved: () => void }) {
  const toast = useToast()
  const [provider, setProvider] = useState(cap.selected ?? cap.options[0]?.id ?? '')
  const [credential, setCredential] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const chosen = cap.options.find((o) => o.id === provider)

  async function save() {
    if (!provider) {
      toast.push('error', 'Select a provider')
      return
    }
    const fields = chosen?.credentialFields ?? []
    for (const f of fields) {
      if (!credential[f]) {
        toast.push('error', `${f} is required`)
        return
      }
    }
    setSaving(true)
    try {
      await api.put('/config/providers', { capability: cap.capability, provider, credential })
      toast.push('success', `${cap.capability} provider saved`)
      setCredential({})
      onSaved()
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, textTransform: 'capitalize' }}>{cap.capability}</h3>
        <Badge status={cap.credentialConfigured ? 'ACTIVE' : ''}>
          {cap.credentialConfigured ? 'Configured' : 'Not configured'}
        </Badge>
      </div>

      {cap.options.length === 0 ? (
        <span className="dim">No providers available for this capability.</span>
      ) : (
        <>
          <Field label="Provider">
            <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {cap.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.recommended ? ' (recommended)' : ''}
                </option>
              ))}
            </select>
          </Field>

          {(chosen?.credentialFields ?? []).map((f) => (
            <Field key={f} label={f}>
              <input
                className="input"
                type="password"
                value={credential[f] ?? ''}
                placeholder={`Enter ${f}`}
                onChange={(e) => setCredential({ ...credential, [f]: e.target.value })}
              />
            </Field>
          ))}

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save credential'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function ProvidersSettingsPage() {
  const [caps, setCaps] = useState<CapabilityConfig[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCaps(await api.get<CapabilityConfig[]>('/config/providers'))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader title="Providers" subtitle="Connect an AI, email or telephony provider for each capability" />

      {loading ? (
        <TableSkeleton cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !caps || caps.length === 0 ? (
        <EmptyState icon="🔌" title="No capabilities available" />
      ) : (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          {caps.map((cap) => (
            <CapabilityCard key={cap.capability} cap={cap} onSaved={load} />
          ))}
        </div>
      )}
    </>
  )
}
