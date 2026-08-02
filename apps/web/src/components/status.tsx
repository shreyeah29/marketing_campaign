'use client'

import type { ReactNode } from 'react'

/**
 * The eleven states in the design brief's status vocabulary (1.6). Every status
 * in the product is one of these — screens map their backend enum to a kind and
 * render it here, never hand-rolling a colour or a label.
 */
export type StatusKind =
  | 'draft'
  | 'ai-draft'
  | 'needs-review'
  | 'needs-changes'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'live'
  | 'rejected'
  | 'failed'
  | 'completed'

type Hue = 'slate' | 'iris' | 'amber' | 'jade' | 'cobalt' | 'crimson'
type Rail = 'none' | 'solid' | 'dashed' | 'pulse' | 'animated'

const STATUS: Record<StatusKind, { label: string; hue: Hue; rail: Rail }> = {
  draft: { label: 'Draft', hue: 'slate', rail: 'none' },
  'ai-draft': { label: 'AI draft', hue: 'iris', rail: 'solid' },
  'needs-review': { label: 'Needs review', hue: 'amber', rail: 'solid' },
  'needs-changes': { label: 'Needs changes', hue: 'amber', rail: 'dashed' },
  approved: { label: 'Approved', hue: 'jade', rail: 'solid' },
  scheduled: { label: 'Scheduled', hue: 'cobalt', rail: 'solid' },
  publishing: { label: 'Publishing', hue: 'cobalt', rail: 'animated' },
  live: { label: 'Live', hue: 'jade', rail: 'pulse' },
  rejected: { label: 'Rejected', hue: 'crimson', rail: 'solid' },
  failed: { label: 'Failed', hue: 'crimson', rail: 'solid' },
  completed: { label: 'Completed', hue: 'slate', rail: 'none' },
}

/**
 * Backend enums → status kinds. The API speaks in per-resource enums
 * (`GENERATED`, `NEEDS_REVIEW`, `ACTIVE`, `PAUSED`…); users should never see one.
 * Add a row here rather than a ternary in a page.
 */
const FROM_API: Record<string, StatusKind> = {
  DRAFT: 'draft',
  GENERATED: 'ai-draft',
  NEEDS_REVIEW: 'needs-review',
  CHANGES_REQUESTED: 'needs-changes',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'live',
  ACTIVE: 'live',
  LIVE: 'live',
  REJECTED: 'rejected',
  FAILED: 'failed',
  ERROR: 'failed',
  COMPLETED: 'completed',
  ARCHIVED: 'completed',
  PAUSED: 'draft',
  // Org / platform
  TRIAL: 'scheduled',
  SUSPENDED: 'rejected',
  DELETED: 'completed',
  // Tickets / chat
  OPEN: 'live',
  CLOSED: 'completed',
  RESOLVED: 'completed',
  PENDING: 'draft',
  QUEUED: 'draft',
  // Connections
  CONNECTED: 'live',
  NOT_CONNECTED: 'draft',
  DISCONNECTED: 'draft',
  EXPIRED: 'failed',
  TOKEN_EXPIRED: 'failed',
  // CRM stages (relabel only — Won jade / Lost crimson; rest slate)
  NEW: 'draft',
  CONTACTED: 'draft',
  QUALIFIED: 'approved',
  NURTURING: 'draft',
  WON: 'live',
  LOST: 'rejected',
  // Misc resource flags
  SHARED: 'approved',
  PRIVATE: 'draft',
  ASSIGNABLE: 'approved',
  OWNER: 'live',
  HIGH: 'failed',
  MEDIUM: 'draft',
  LOW: 'draft',
  URGENT: 'failed',
  SUCCESS: 'live',
  INFO: 'draft',
  WARNING: 'draft',
  WARN: 'draft',
  DANGER: 'failed',
  OK: 'live',
  INTERNAL: 'draft',
  CONDITION: 'draft',
  ACTION: 'scheduled',
  TRIGGER: 'scheduled',
  DELAY: 'draft',
  START: 'live',
  READY: 'completed',
  PROCESSING: 'publishing',
  SUCCEEDED: 'live',
}

/** Maps a raw backend status to a kind, falling back to neutral — never amber. */
export function toStatus(raw: string | null | undefined): StatusKind {
  if (!raw) return 'draft'
  return FROM_API[raw.toUpperCase().replace(/\s+/g, '_')] ?? 'draft'
}

export function statusLabel(kind: StatusKind): string {
  return STATUS[kind].label
}

/** Human label for a raw API status (mapped kind label, never the enum). */
export function statusLabelFromApi(raw: string | null | undefined): string {
  return statusLabel(toStatus(raw))
}

/**
 * Human labels for asset kinds / channel type strings. Raw enums must never
 * reach the UI.
 */
const KIND_LABELS: Record<string, string> = {
  POST: 'Post',
  STORY: 'Story',
  REEL: 'Reel',
  CAROUSEL: 'Carousel',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  LANDING: 'Landing page',
  BLOG: 'Blog',
  ARTICLE: 'Article',
  IMAGE_PROMPT: 'Image',
  VIDEO_PROMPT: 'Video',
  AD: 'Ad',
  THREAD: 'Thread',
}

export function kindLabel(raw: string | null | undefined): string {
  if (!raw) return ''
  return (
    KIND_LABELS[raw.toUpperCase()] ??
    raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  )
}

export function StatusPill({ status }: { status: StatusKind }) {
  const { label, hue, rail } = STATUS[status]
  return (
    <span className="status-pill" data-hue={hue}>
      {rail === 'pulse' ? <span className="status-dot" /> : null}
      {label}
    </span>
  )
}

/**
 * The left rail. Wrap any row, card or panel whose state should read from across
 * the room. Colour transitions over --dur-slow, which is what makes approval feel
 * like it landed (brief 1.7).
 */
export function StatusRail({
  status,
  children,
  className,
}: {
  status: StatusKind
  children: ReactNode
  className?: string | undefined
}) {
  const { hue, rail } = STATUS[status]
  return (
    <div
      className={`status-rail ${className ?? ''}`}
      data-hue={hue}
      data-rail={rail}
      data-provisional={status === 'ai-draft' ? '' : undefined}
    >
      {children}
    </div>
  )
}

/** Neutral count/tag chip — never wears a status colour. */
export function Chip({ children, title }: { children: ReactNode; title?: string | undefined }) {
  return (
    <span className="chip" title={title}>
      {children}
    </span>
  )
}
