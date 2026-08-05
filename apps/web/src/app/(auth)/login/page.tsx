'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { Banner, LoadingScreen, Spinner } from '@/components/ui'

export default function LoginPage() {
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
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockUntil, setLockUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const justRegistered = params.get('registered') === '1'
  const justReset = params.get('reset') === '1'
  const locked = lockUntil !== null && now < lockUntil
  const lockSeconds = locked && lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0

  useEffect(() => {
    if (!locked) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [locked])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (locked) return
    setError(null)
    setBusy(true)
    try {
      await authClient.signIn(email, password)
      router.replace(params.get('next') ?? '/app')
    } catch (err) {
      const ae = err as AuthError
      if (ae.code === 'account_locked') {
        setLockUntil(Date.now() + 60_000)
        setError(null)
      } else {
        setError(ae.message || 'Invalid email or password')
      }
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Access your intelligent dashboard"
      panelTitle="Marketing intelligence, in one place."
      panelSubtitle="Plan the campaign, approve the work, watch it perform — without leaving the workspace."
      tone="dark"
    >
      {justRegistered ? (
        <Banner kind="success">Account created — sign in to continue.</Banner>
      ) : null}
      {justReset ? (
        <Banner kind="success">Password updated — sign in with your new password.</Banner>
      ) : null}
      {locked ? (
        <Banner kind="error">Too many failed attempts. Try again in {lockSeconds}s.</Banner>
      ) : null}
      {error && !locked ? <Banner kind="error">{error}</Banner> : null}

      <form onSubmit={(ev) => void submit(ev)}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-email">
            Email address
          </label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="auth-field">
          <div className="auth-field__row">
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <Link href="/forgot-password" className="auth-link-quiet">
              Forgot password?
            </Link>
          </div>
          <input
            id="login-password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className="auth-check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Remember me for 30 days</span>
        </label>

        <button className="auth-submit" disabled={busy || locked} type="submit">
          {busy ? <Spinner /> : 'Sign in to dashboard'}
        </button>
      </form>

      <p className="auth-alt">
        New here? <Link href="/register">Create an account</Link>
      </p>
      <p className="auth-alt" style={{ marginTop: 'var(--space-3)' }}>
        <Link href="/platform/login" className="auth-link-quiet">
          Operator sign-in
        </Link>
      </p>
    </AuthShell>
  )
}
