'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { authClient, type AuthError, type AuthSession } from '@/lib/auth-client'
import { AuthShell } from '@/components/auth-shell'
import { Banner, LoadingScreen, Spinner } from '@/components/ui'

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AcceptInvitationInner />
    </Suspense>
  )
}

type State =
  | { kind: 'loading' }
  | { kind: 'needs-auth' }
  | { kind: 'ready'; session: AuthSession }
  | { kind: 'accepted' }
  | { kind: 'error'; message: string }

function AcceptInvitationInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', message: 'This invitation link is missing its token.' })
      return
    }
    authClient
      .session()
      .then((session) => setState({ kind: 'ready', session }))
      .catch((err: unknown) => {
        // Not signed in — the invitee must authenticate first, keeping the token.
        if (err instanceof ApiError && err.status === 401) {
          setState({ kind: 'needs-auth' })
          return
        }
        setState({ kind: 'error', message: 'Could not load the invitation.' })
      })
  }, [token])

  const accept = useCallback(async () => {
    if (!token) return
    setBusy(true)
    try {
      await authClient.acceptInvitation(token)
      setState({ kind: 'accepted' })
      setTimeout(() => router.replace('/app'), 900)
    } catch (err) {
      setState({
        kind: 'error',
        message: (err as AuthError).message || 'Could not accept the invitation.',
      })
      setBusy(false)
    }
  }, [token, router])

  if (state.kind === 'loading') return <LoadingScreen />

  const returnTo = `/accept-invitation?token=${token ?? ''}`

  return (
    <AuthShell
      panelTitle="You've been invited."
      panelSubtitle="Set a password and your workspace is ready."
      tone="light"
      title="Accept invitation"
      subtitle={
        state.kind === 'needs-auth'
          ? 'Sign in or create an account to join the workspace you were invited to.'
          : undefined
      }
    >
      {state.kind === 'needs-auth' && (
        <>
          <Link
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
          >
            Sign in
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(returnTo)}`}
            className="btn"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Create account
          </Link>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <p className="page-sub" style={{ marginBottom: 18 }}>
            Signed in as <strong>{state.session.user.email}</strong>. Accept to join the workspace.
          </p>
          <button
            className="btn primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={busy}
            onClick={accept}
          >
            {busy ? <Spinner /> : 'Accept invitation'}
          </button>
        </>
      )}

      {state.kind === 'accepted' && (
        <Banner kind="success">You're in — taking you to your workspace…</Banner>
      )}

      {state.kind === 'error' && (
        <>
          <Banner kind="error">{state.message}</Banner>
          <Link href="/login" className="muted" style={{ fontSize: 13 }}>
            Back to sign in
          </Link>
        </>
      )}
    </AuthShell>
  )
}
