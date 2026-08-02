'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
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
    <AuthShell
      title="Create your account"
      subtitle="Start here. You'll join a workspace by invitation or provisioning."
      footer={
        <div className="muted" style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--text-link)', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      }
    >
      {error ? <Banner kind="error">{error}</Banner> : null}
      <form onSubmit={submit}>
        <Field label="Full name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
        <button
          className="btn primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy}
          type="submit"
        >
          {busy ? <Spinner /> : 'Create account'}
        </button>
      </form>
    </AuthShell>
  )
}
