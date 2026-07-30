'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { Banner, Field, LoadingScreen, Spinner } from '@/components/ui'

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RegisterInner />
    </Suspense>
  )
}

function RegisterInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await authClient.signUp(name, email, password)
      // Better Auth signs the user in on sign-up. A new account has no organisation
      // yet, so the app shell guides them to accept an invite or wait to be
      // provisioned — unless a `next` (e.g. an invitation) says where to go.
      router.replace(params.get('next') ?? '/app')
    } catch (err) {
      setError((err as AuthError).message || 'Registration failed')
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand" style={{ padding: '0 0 20px' }}>
          <span className="dot" />
          <strong>VSP</strong>
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Create your account</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          Start here. You'll join a workspace by invitation or provisioning.
        </p>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <form onSubmit={submit}>
          <Field label="Full name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
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
          <Field label="Password" hint="At least 8 characters.">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? <Spinner /> : 'Create account'}
          </button>
        </form>
        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }} className="muted">
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--color-primary)' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
