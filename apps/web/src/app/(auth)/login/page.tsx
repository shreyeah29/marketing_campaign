'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { Banner, Field, LoadingScreen, Spinner } from '@/components/ui'

export default function LoginPage() {
  // useSearchParams must sit under a Suspense boundary for the prerender.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const justRegistered = params.get('registered') === '1'
  const justReset = params.get('reset') === '1'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await authClient.signIn(email, password)
      router.replace(params.get('next') ?? '/app')
    } catch (err) {
      const e = err as AuthError
      setError(
        e.code === 'account_locked'
          ? 'Too many failed attempts. Try again in a few minutes.'
          : e.message || 'Sign-in failed',
      )
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
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Sign in</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          Welcome back. Sign in to your workspace.
        </p>
        {justRegistered ? (
          <Banner kind="success">Account created — sign in to continue.</Banner>
        ) : null}
        {justReset ? (
          <Banner kind="success">Password updated — sign in with your new password.</Banner>
        ) : null}
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
        <div className="spread" style={{ marginTop: 16, fontSize: 13 }}>
          <Link href="/forgot-password" className="muted">
            Forgot password?
          </Link>
          <Link href="/register" style={{ color: 'var(--color-primary)' }}>
            Create account
          </Link>
        </div>
      </div>
    </div>
  )
}
