'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import { ConfirmDialog, ErrorState, PageHeader, useToast } from '@/components/kit'
import { Badge, Field, Spinner } from '@/components/ui'
import { PageBlocks, type Block } from '@/components/page-blocks'
import { Icon } from '@/components/icon'

interface LandingPage {
  id: string
  name: string
  slug: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  title: string | null
  blocks: Block[]
  seoTitle: string | null
  seoDescription: string | null
  visitCount: number
}

type BlockType = 'hero' | 'features' | 'text' | 'cta' | 'image'

const BLOCK_DEFAULTS: Record<BlockType, () => Block> = {
  hero: () => ({
    type: 'hero',
    heading: 'A headline that sells',
    subheading: 'One clear sentence about the outcome you deliver.',
    ctaLabel: 'Get started',
    ctaUrl: '#',
    imageUrl: '',
  }),
  features: () => ({
    type: 'features',
    heading: 'Why teams choose us',
    items: [
      { title: 'Fast', body: 'Set up in minutes, not weeks.' },
      { title: 'Simple', body: 'An interface anyone can use.' },
      { title: 'Reliable', body: 'Built to scale with you.' },
    ],
  }),
  text: () => ({ type: 'text', heading: 'About', body: 'Tell your story here.' }),
  cta: () => ({
    type: 'cta',
    heading: 'Ready to get started?',
    buttonLabel: 'Sign up',
    buttonUrl: '#',
  }),
  image: () => ({ type: 'image', url: '', alt: '' }),
}

const BLOCK_LABEL: Record<BlockType, string> = {
  hero: 'Hero',
  features: 'Features',
  text: 'Text',
  cta: 'Call to action',
  image: 'Image',
}

const STATUS_TINT: Record<string, string> = {
  DRAFT: 'info',
  PUBLISHED: 'ok',
  ARCHIVED: 'warn',
}

export default function LandingPageBuilder() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const toast = useToast()

  const [page, setPage] = useState<LandingPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])

  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const hydrate = useCallback((p: LandingPage) => {
    setPage(p)
    setName(p.name)
    setTitle(p.title ?? '')
    setSeoTitle(p.seoTitle ?? '')
    setSeoDescription(p.seoDescription ?? '')
    setBlocks(Array.isArray(p.blocks) ? p.blocks : [])
  }, [])

  const load = useCallback(() => {
    setError(null)
    api
      .get<LandingPage>(`/landing-pages/${id}`)
      .then(hydrate)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Failed to load'))
  }, [id, hydrate])
  useEffect(load, [load])

  function addBlock(type: BlockType) {
    setBlocks((b) => [...b, BLOCK_DEFAULTS[type]()])
    setAddOpen(false)
  }

  function updateBlock(index: number, patch: Record<string, unknown>) {
    setBlocks((b) => b.map((blk, i) => (i === index ? { ...blk, ...patch } : blk)))
  }

  function removeBlock(index: number) {
    setBlocks((b) => b.filter((_, i) => i !== index))
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks((b) => {
      const next = [...b]
      const target = index + dir
      if (target < 0 || target >= next.length) return b
      const tmp = next[index]!
      next[index] = next[target]!
      next[target] = tmp
      return next
    })
  }

  async function save() {
    setSaving(true)
    try {
      const updated = await api.patch<LandingPage>(`/landing-pages/${id}`, {
        name: name.trim() || 'Untitled',
        title: title.trim().length > 0 ? title.trim() : null,
        seoTitle: seoTitle.trim().length > 0 ? seoTitle.trim() : null,
        seoDescription: seoDescription.trim().length > 0 ? seoDescription.trim() : null,
        blocks,
      })
      hydrate(updated)
      toast.push('success', 'Saved')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function act(label: string, fn: () => Promise<LandingPage>) {
    setBusy(label)
    try {
      const updated = await fn()
      hydrate(updated)
      toast.push('success', `${label} done`)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  async function del() {
    try {
      await api.del(`/landing-pages/${id}`)
      toast.push('success', 'Page deleted')
      router.push('/app/marketing/pages')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!page)
    return (
      <div className="state">
        <Spinner />
      </div>
    )

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = `${origin}/p/${page.slug}`

  return (
    <>
      <PageHeader
        title={name || 'Untitled page'}
        subtitle="Build the page block by block, then publish it to a public URL."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => router.push('/app/marketing/pages')}>
              <Icon name="arrow-left" size={14} /> Back
            </button>
            <button className="btn primary" disabled={saving} onClick={() => void save()}>
              {saving ? <Spinner /> : 'Save'}
            </button>
          </div>
        }
      />

      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Badge status={STATUS_TINT[page.status]}>{page.status}</Badge>
        <span
          className="dim"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Icon name="eye" size={13} /> {page.visitCount} visits
        </span>
        {page.status === 'PUBLISHED' ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="dim"
            style={{ fontSize: 12 }}
          >
            {publicUrl}
          </a>
        ) : null}
        <div className="grow" />
        {page.status === 'PUBLISHED' ? (
          <button
            className="btn sm"
            disabled={busy !== null}
            onClick={() =>
              void act('Unpublish', () => api.post<LandingPage>(`/landing-pages/${id}/unpublish`))
            }
          >
            {busy === 'Unpublish' ? <Spinner /> : 'Unpublish'}
          </button>
        ) : (
          <button
            className="btn primary sm"
            disabled={busy !== null}
            onClick={() =>
              void act('Publish', () => api.post<LandingPage>(`/landing-pages/${id}/publish`))
            }
          >
            {busy === 'Publish' ? (
              <Spinner />
            ) : (
              <>
                <Icon name="rocket" size={14} /> Publish
              </>
            )}
          </button>
        )}
        <button className="btn ghost sm" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={15} /> Delete
        </button>
      </div>

      <div
        className="split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start',
        }}
      >
        {/* Editor */}
        <div className="stack" style={{ gap: 14 }}>
          <div className="card">
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Settings</h3>
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Title">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="SEO title">
              <input
                className="input"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
            </Field>
            <Field label="SEO description">
              <textarea
                className="input"
                rows={2}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </Field>
          </div>

          {blocks.map((block, i) => (
            <div key={i} className="card">
              <div className="spread" style={{ marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {BLOCK_LABEL[block.type as BlockType] ?? block.type}
                </span>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="btn ghost sm"
                    disabled={i === 0}
                    onClick={() => moveBlock(i, -1)}
                    aria-label="Move up"
                  >
                    <Icon name="arrow-up" size={15} />
                  </button>
                  <button
                    className="btn ghost sm"
                    disabled={i === blocks.length - 1}
                    onClick={() => moveBlock(i, 1)}
                    aria-label="Move down"
                  >
                    <Icon name="arrow-down" size={15} />
                  </button>
                  <button
                    className="btn ghost sm"
                    onClick={() => removeBlock(i)}
                    aria-label="Remove"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>
              </div>
              <BlockEditor block={block} onChange={(patch) => updateBlock(i, patch)} />
            </div>
          ))}

          <div className="card" style={{ position: 'relative' }}>
            <button className="btn" onClick={() => setAddOpen((o) => !o)}>
              <Icon name="plus" size={15} /> Add block
            </button>
            {addOpen ? (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                {(Object.keys(BLOCK_LABEL) as BlockType[]).map((t) => (
                  <button
                    key={t}
                    className="btn ghost sm"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => addBlock(t)}
                  >
                    {BLOCK_LABEL[t]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Live preview */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="dim"
            style={{
              fontSize: 11,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            Live preview
          </div>
          <div style={{ background: '#fff', color: '#111', overflowX: 'auto' }}>
            {blocks.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#888', fontSize: 14 }}>
                Add a block to see it here.
              </div>
            ) : (
              <PageBlocks blocks={blocks} />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete page?"
        message="This removes the landing page. Its public URL will stop working."
        confirmLabel="Delete"
        danger
        onConfirm={() => void del()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

function str(block: Block, key: string): string {
  const v = block[key]
  return typeof v === 'string' ? v : ''
}

function BlockEditor({
  block,
  onChange,
}: {
  block: Block
  onChange: (patch: Record<string, unknown>) => void
}) {
  switch (block.type) {
    case 'hero':
      return (
        <>
          <Field label="Heading">
            <input
              className="input"
              value={str(block, 'heading')}
              onChange={(e) => onChange({ heading: e.target.value })}
            />
          </Field>
          <Field label="Subheading">
            <textarea
              className="input"
              rows={2}
              value={str(block, 'subheading')}
              onChange={(e) => onChange({ subheading: e.target.value })}
            />
          </Field>
          <div className="row" style={{ gap: 10 }}>
            <Field label="Button label">
              <input
                className="input"
                value={str(block, 'ctaLabel')}
                onChange={(e) => onChange({ ctaLabel: e.target.value })}
              />
            </Field>
            <Field label="Button URL">
              <input
                className="input"
                value={str(block, 'ctaUrl')}
                onChange={(e) => onChange({ ctaUrl: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Image URL" hint="Optional">
            <input
              className="input"
              value={str(block, 'imageUrl')}
              onChange={(e) => onChange({ imageUrl: e.target.value })}
            />
          </Field>
        </>
      )
    case 'features':
      return <FeaturesEditor block={block} onChange={onChange} />
    case 'text':
      return (
        <>
          <Field label="Heading" hint="Optional">
            <input
              className="input"
              value={str(block, 'heading')}
              onChange={(e) => onChange({ heading: e.target.value })}
            />
          </Field>
          <Field label="Body">
            <textarea
              className="input"
              rows={4}
              value={str(block, 'body')}
              onChange={(e) => onChange({ body: e.target.value })}
            />
          </Field>
        </>
      )
    case 'cta':
      return (
        <>
          <Field label="Heading">
            <input
              className="input"
              value={str(block, 'heading')}
              onChange={(e) => onChange({ heading: e.target.value })}
            />
          </Field>
          <div className="row" style={{ gap: 10 }}>
            <Field label="Button label">
              <input
                className="input"
                value={str(block, 'buttonLabel')}
                onChange={(e) => onChange({ buttonLabel: e.target.value })}
              />
            </Field>
            <Field label="Button URL">
              <input
                className="input"
                value={str(block, 'buttonUrl')}
                onChange={(e) => onChange({ buttonUrl: e.target.value })}
              />
            </Field>
          </div>
        </>
      )
    case 'image':
      return (
        <>
          <Field label="Image URL">
            <input
              className="input"
              value={str(block, 'url')}
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </Field>
          <Field label="Alt text" hint="Optional">
            <input
              className="input"
              value={str(block, 'alt')}
              onChange={(e) => onChange({ alt: e.target.value })}
            />
          </Field>
        </>
      )
    default:
      return null
  }
}

interface FeatureItem {
  title: string
  body: string
}

function FeaturesEditor({
  block,
  onChange,
}: {
  block: Block
  onChange: (patch: Record<string, unknown>) => void
}) {
  const raw = block['items']
  const list: FeatureItem[] = Array.isArray(raw)
    ? raw.map((it) => {
        const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
        return {
          title: typeof o['title'] === 'string' ? o['title'] : '',
          body: typeof o['body'] === 'string' ? o['body'] : '',
        }
      })
    : []

  function setItems(next: FeatureItem[]) {
    onChange({ items: next })
  }

  return (
    <>
      <Field label="Heading">
        <input
          className="input"
          value={str(block, 'heading')}
          onChange={(e) => onChange({ heading: e.target.value })}
        />
      </Field>
      <div className="stack" style={{ gap: 8 }}>
        {list.map((it, i) => (
          <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <div className="stack grow" style={{ gap: 6 }}>
              <input
                className="input"
                placeholder="Title"
                value={it.title}
                onChange={(e) =>
                  setItems(list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                }
              />
              <input
                className="input"
                placeholder="Description"
                value={it.body}
                onChange={(e) =>
                  setItems(list.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))
                }
              />
            </div>
            <button
              className="btn ghost sm"
              onClick={() => setItems(list.filter((_, j) => j !== i))}
              aria-label="Remove item"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn ghost sm"
        style={{ marginTop: 8 }}
        onClick={() => setItems([...list, { title: '', body: '' }])}
      >
        <Icon name="plus" size={15} /> Add feature
      </button>
    </>
  )
}
