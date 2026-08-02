'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { Banner, Field, LoadingScreen, Spinner } from '@/components/ui'

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
      title="Sign in"
      footer={
        <div className="spread">
          <Link href="/forgot-password" className="muted">
            Forgot password?
          </Link>
          <Link href="/register" style={{ color: 'var(--text-link)', fontWeight: 600 }}>
            Create account
          </Link>
        </div>
      }
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
        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy || locked}
          type="submit"
        >
          {busy ? <Spinner /> : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
