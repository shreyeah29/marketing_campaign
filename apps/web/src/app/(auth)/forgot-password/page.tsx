'use client'

import Link from 'next/link'
import { useState } from 'react'

import { authClient, type AuthError } from '@/lib/auth-client'
import { Banner, Field, Spinner } from '@/components/ui'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await authClient.requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError((err as AuthError).message || 'Could not send reset email')
    } finally {
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
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Reset your password</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          Enter your email and we'll send a reset link.
        </p>
        {sent ? (
          <Banner kind="success">
            If an account exists for {email}, a reset link is on its way. Check your inbox.
          </Banner>
        ) : (
          <>
            {error ? <Banner kind="error">{error}</Banner> : null}
            <form onSubmit={submit}>
              <Field label="Email">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <button className="btn primary" style={{ width: '100%' }} disabled={busy} type="submit">
                {busy ? <Spinner /> : 'Send reset link'}
              </button>
            </form>
          </>
        )}
        <div style={{ marginTop: 16, fontSize: 13, textAlign: 'center' }}>
          <Link href="/login" className="muted">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
