'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import {
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
  type Column,
} from '@/components/kit'
import { Badge, Field } from '@/components/ui'
import { Icon } from '@/components/icon'

interface Member {
  membershipId: string
  userId: string
  name: string | null
  email: string
  role: string
  permissions?: string[]
  lastLoginAt: string | null
}

const ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']

export default function UsersSettingsPage() {
  const toast = useToast()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [inviting, setInviting] = useState(false)
  const [savingRole, setSavingRole] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Members list returns membershipId as the identifier; map it to `id` so the
      // table (which keys on id) is happy.
      const rows = await api.get<Member[]>('/members')
      setMembers(rows ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function invite() {
    if (!inviteEmail) {
      toast.push('error', 'Email is required')
      return
    }
    setInviting(true)
    try {
      await api.post('/members/invitations', { email: inviteEmail, role: inviteRole })
      toast.push('success', `Invitation sent to ${inviteEmail}`)
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('MEMBER')
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(m: Member, role: string) {
    if (role === m.role) return
    setSavingRole(m.membershipId)
    try {
      await api.patch(`/members/${m.membershipId}/role`, { role })
      toast.push('success', `${m.name ?? m.email} is now ${role}`)
      void load()
    } catch (err) {
      toast.push('error', err instanceof ApiError ? err.message : 'Role change failed')
    } finally {
      setSavingRole(null)
    }
  }

  const rows = (members ?? []).map((m) => ({ ...m, id: m.membershipId }))

  const columns: Column<Member & { id: string }>[] = [
    { key: 'name', header: 'Name', render: (r) => r.name ?? '—' },
    { key: 'email', header: 'Email', render: (r) => r.email },
    {
      key: 'role',
      header: 'Role',
      render: (r) =>
        r.role === 'OWNER' ? (
          <Badge>OWNER</Badge>
        ) : (
          <select
            className="select"
            value={r.role}
            disabled={savingRole === r.membershipId}
            onChange={(e) => void changeRole(r, e.target.value)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : 'Never'),
    },
  ]

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="People with access to this workspace"
        actions={
          <button className="btn primary" onClick={() => setInviteOpen(true)}>
            <Icon name="plus" size={15} /> Invite
          </button>
        }
      />

      {loading ? (
        <TableSkeleton cols={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState icon="users" title="No members yet" hint="Invite your first teammate to collaborate." />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      <Drawer
        open={inviteOpen}
        title="Invite teammate"
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={invite} disabled={inviting}>
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </>
        }
      >
        <Field label="Email *">
          <input
            className="input"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@company.com"
          />
        </Field>
        <Field label="Role">
          <select className="select" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </Field>
      </Drawer>
    </>
  )
}
