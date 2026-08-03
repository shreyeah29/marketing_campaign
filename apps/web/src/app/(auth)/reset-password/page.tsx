'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { Banner, Field, LoadingScreen, Spinner } from '@/components/ui'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!token) {
      setError('This reset link is missing its token. Request a new one.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      await authClient.resetPassword(password, token)
      router.replace('/login?reset=1')
    } catch (err) {
      setError((err as AuthError).message || 'Could not reset password')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      panelTitle="One last step."
      panelSubtitle="Choose a new password and you're back in."
      tone="light"
      title="Choose a new password"
      subtitle="Enter a new password for your account."
    >
      {!token ? (
        <Banner kind="error">
          This link is invalid or expired.{' '}
          <Link href="/forgot-password" style={{ color: 'var(--cobalt-600)', fontWeight: 600 }}>
            Request a new one
          </Link>
          .
        </Banner>
      ) : (
        <>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <form onSubmit={submit}>
            <Field label="New password" hint="At least 8 characters.">
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
              {busy ? <Spinner /> : 'Update password'}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
