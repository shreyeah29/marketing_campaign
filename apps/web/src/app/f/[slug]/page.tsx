'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'

type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

interface FormField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  placeholder?: string
}

interface PublicForm {
  id: string
  name: string
  headline?: string | null
  description?: string | null
  fields: FormField[]
  submitLabel?: string | null
  successMessage?: string | null
  accentColor?: string | null
}

interface SubmitResult {
  ok: boolean
  successMessage: string | null
  redirectUrl: string | null
}

const shell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: '#0b0d12',
  color: '#e8eaf0',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: '#151821',
  border: '1px solid #262b38',
  borderRadius: 14,
  padding: 28,
  boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #2c3242',
  background: '#0f121a',
  color: '#e8eaf0',
  fontSize: 14,
  boxSizing: 'border-box',
}

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

  const [form, setForm] = useState<PublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(false)
    api
      .get<PublicForm>(`/public/forms/${slug}`)
      .then((f) => {
        setForm({ ...f, fields: Array.isArray(f.fields) ? f.fields : [] })
        setNotFound(false)
      })
      .catch((e: unknown) => {
        // A real 404 means the form doesn't exist / isn't published — permanent.
        // Any other error (network blip, 5xx) is transient and recoverable.
        if (e instanceof ApiError && e.status === 404) setNotFound(true)
        else setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [slug])
  useEffect(load, [load])

  const accent =
    form?.accentColor && /^#?[0-9a-fA-F]{3,8}$/.test(form.accentColor)
      ? form.accentColor
      : '#4f46e5'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErrorMsg(null)
    setSubmitting(true)
    try {
      const res = await api.post<SubmitResult>(`/public/forms/${slug}`, values)
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      setDone(res.successMessage ?? "Thank you — we've received your submission.")
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={shell}>
        <div style={{ opacity: 0.6 }}>Loading…</div>
      </div>
    )
  }

  if (loadError && !notFound) {
    return (
      <div style={shell}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Couldn&apos;t load this form</h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '8px 0 16px' }}>
            Please check your connection and try again.
          </p>
          <button
            onClick={load}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: accent,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div style={shell}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <h1 style={{ fontSize: 18, margin: 0 }}>This form is not available</h1>
          <p style={{ opacity: 0.6, marginTop: 8, fontSize: 14 }}>
            The link may be incorrect, or the form is no longer published.
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={shell}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h1 style={{ fontSize: 20, margin: 0 }}>{done}</h1>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <form style={cardStyle} onSubmit={(e) => void submit(e)}>
        <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>{form.headline || form.name}</h1>
        {form.description ? (
          <p style={{ opacity: 0.7, fontSize: 14, marginTop: 0, marginBottom: 20 }}>
            {form.description}
          </p>
        ) : (
          <div style={{ height: 12 }} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {form.fields.map((f) => (
            <label key={f.key} style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
                {f.label}
                {f.required ? <span style={{ color: '#f87171' }}> *</span> : null}
              </span>
              {f.type === 'textarea' ? (
                <textarea
                  style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
                  required={f.required ?? false}
                  placeholder={f.placeholder ?? ''}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : f.type === 'select' ? (
                <select
                  style={inputStyle}
                  required={f.required ?? false}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={inputStyle}
                  type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                  required={f.required ?? false}
                  placeholder={f.placeholder ?? ''}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>

        {errorMsg ? (
          <div style={{ color: '#f87171', fontSize: 13, marginTop: 14 }}>{errorMsg}</div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            background: accent,
            color: '#fff',
            fontSize: 15,
            fontWeight: 600,
            cursor: submitting ? 'default' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting…' : form.submitLabel || 'Submit'}
        </button>
      </form>
    </div>
  )
}
