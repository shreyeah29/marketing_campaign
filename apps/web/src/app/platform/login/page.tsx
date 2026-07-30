'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { platform } from '@/lib/platform'
import { Banner, Field, Spinner } from '@/components/ui'

export default function PlatformLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await platform.login(email, password)
      router.replace('/platform')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand" style={{ padding: '0 0 20px' }}>
          <span className="dot" />
          <strong>VSP Platform</strong>
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Operator sign-in</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          The platform-owner console. Not accessible to client organizations.
        </p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <form onSubmit={submit}>
          <Field label="Email">
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? <Spinner /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
