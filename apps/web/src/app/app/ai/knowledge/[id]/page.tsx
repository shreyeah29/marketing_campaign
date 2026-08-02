'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { ApiError, api } from '@/lib/api'
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  useToast,
} from '@/components/kit'
import { Field, Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'
import { Chip, StatusPill, toStatus } from '@/components/status'

interface KnowledgeBase {
  id: string
  name: string
  description?: string | null
  documentCount?: number
  chunkCount?: number
}

interface KbDocument {
  id: string
  title: string
  status: string
  mimeType?: string | null
  sourceType?: string | null
  chunkCount?: number
  failureReason?: string | null
  indexedAt?: string | null
  createdAt?: string
  metadata?: { sizeBytes?: number } | null
}

interface SearchHit {
  id: string
  documentTitle: string
  content: string
  score: number
}

/** Per-file state while a batch is being read + uploaded. */
interface Uploading {
  name: string
  status: 'reading' | 'uploading' | 'done' | 'error'
  error?: string
}

// Text-based files we can extract and index. Binary formats (pdf/docx) would need
// a server-side extractor, so we accept only what we can honestly read as text.
const TEXT_EXT = [
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'log',
  'html',
  'htm',
  'xml',
  'yaml',
  'yml',
  'rtf',
]
const MAX_BYTES = 400_000

function isTextFile(f: File): boolean {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  return f.type.startsWith('text/') || TEXT_EXT.includes(ext)
}

function fmtBytes(n?: number): string {
  if (!n) return '—'
  if (n < 1024) return `${String(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams<{ id: string }>()
  const kbId = params.id
  const toast = useToast()

  const [kb, setKb] = useState<KnowledgeBase | null>(null)
  const [docs, setDocs] = useState<KbDocument[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [indexingAvailable, setIndexingAvailable] = useState(true)

  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState<Uploading[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasting, setPasting] = useState(false)

  const [confirmDel, setConfirmDel] = useState<KbDocument | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchHit[] | null>(null)

  const loadDocs = useCallback(() => {
    api
      .get<{ data: KbDocument[]; indexingAvailable?: boolean }>(
        `/knowledge-bases/${kbId}/documents`,
      )
      .then((r) => {
        setDocs(r.data)
        if (typeof r.indexingAvailable === 'boolean') setIndexingAvailable(r.indexingAvailable)
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load documents'),
      )
  }, [kbId])

  const loadKb = useCallback(() => {
    setError(null)
    api
      .get<KnowledgeBase>(`/knowledge-bases/${kbId}`)
      .then(setKb)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load knowledge base'),
      )
  }, [kbId])

  useEffect(() => {
    loadKb()
    loadDocs()
  }, [loadKb, loadDocs])

  // Poll while any document is still being processed, so status updates live.
  useEffect(() => {
    const active = docs?.some((d) => ['PENDING', 'QUEUED', 'PROCESSING'].includes(d.status))
    if (!active) return
    const t = setInterval(loadDocs, 3000)
    return () => clearInterval(t)
  }, [docs, loadDocs])

  const readAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Could not read file'))
      reader.readAsText(file)
    })

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const batch: Uploading[] = files.map((f) => ({ name: f.name, status: 'reading' }))
      setUploads((prev) => [...prev, ...batch])

      const setStatus = (name: string, patch: Partial<Uploading>) =>
        setUploads((prev) => prev.map((u) => (u.name === name ? { ...u, ...patch } : u)))

      for (const file of files) {
        try {
          if (!isTextFile(file)) throw new Error('Only text files are supported')
          if (file.size > MAX_BYTES) throw new Error('File is too large (max 400 KB)')
          const content = await readAsText(file)
          if (!content.trim()) throw new Error('File is empty')
          setStatus(file.name, { status: 'uploading' })
          await api.post(`/knowledge-bases/${kbId}/documents`, {
            title: file.name,
            content,
            mimeType: file.type || 'text/plain',
            sourceType: 'UPLOAD',
          })
          setStatus(file.name, { status: 'done' })
        } catch (e) {
          setStatus(file.name, {
            status: 'error',
            error: e instanceof ApiError ? e.message : (e as Error).message,
          })
        }
      }
      loadDocs()
      // Clear the finished upload rows after a moment.
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.status === 'error')), 2500)
    },
    [kbId, loadDocs],
  )

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    void uploadFiles(Array.from(e.dataTransfer.files))
  }

  async function addPastedText() {
    if (!pasteTitle.trim() || !pasteBody.trim()) {
      toast.push('error', 'Give the document a title and some content')
      return
    }
    setPasting(true)
    try {
      await api.post(`/knowledge-bases/${kbId}/documents`, {
        title: pasteTitle.trim(),
        content: pasteBody,
        mimeType: 'text/plain',
        sourceType: 'TEXT',
      })
      setPasteOpen(false)
      setPasteTitle('')
      setPasteBody('')
      toast.push('success', 'Document added — indexing started')
      loadDocs()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not add document')
    } finally {
      setPasting(false)
    }
  }

  async function reprocess(doc: KbDocument) {
    try {
      await api.post(`/knowledge-bases/${kbId}/documents/${doc.id}/reprocess`)
      toast.push('success', 'Re-indexing started')
      loadDocs()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Reprocess failed')
    }
  }

  async function doDelete(doc: KbDocument) {
    try {
      await api.del(`/knowledge-bases/${kbId}/documents/${doc.id}`)
      toast.push('success', 'Document deleted')
      setConfirmDel(null)
      loadDocs()
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Delete failed')
    }
  }

  async function runSearch() {
    if (!query.trim()) return
    setSearching(true)
    setResults(null)
    try {
      const r = await api.post<{ results: SearchHit[] }>(`/knowledge-bases/${kbId}/search`, {
        query: query.trim(),
      })
      setResults(r.results)
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="Knowledge base" subtitle="Documents and indexing" />
        <ErrorState
          message={error}
          onRetry={() => {
            loadKb()
            loadDocs()
          }}
        />
      </>
    )
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 4 }}>
        <Link href="/app/ai/knowledge" className="btn ghost sm">
          <Icon name="arrow-left" size={14} /> Knowledge bases
        </Link>
      </div>
      <PageHeader
        title={kb?.name ?? 'Knowledge base'}
        subtitle={kb?.description ?? 'Upload documents to make them searchable by AI'}
        actions={
          <button className="btn" onClick={() => setPasteOpen(true)}>
            <Icon name="plus" size={15} /> Add text
          </button>
        }
      />

      {!indexingAvailable ? (
        <div className="banner info" style={{ marginBottom: 14 }}>
          Documents are stored, but AI indexing isn&apos;t available on this deployment yet —
          uploaded content won&apos;t be searchable until an embedding provider is configured.
        </div>
      ) : null}

      {/* Upload zone */}
      <div
        className="card"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `1.5px dashed ${dragging ? 'var(--color-primary)' : 'var(--border-strong)'}`,
          background: dragging ? 'var(--primary-soft)' : undefined,
          textAlign: 'center',
          padding: '28px 20px',
          marginBottom: 18,
          transition: 'border-color .15s, background .15s',
        }}
      >
        <div style={{ marginBottom: 8, color: 'var(--color-primary)' }}>
          <Icon name="file-text" size={26} />
        </div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Drag &amp; drop files here</div>
        <div className="dim" style={{ fontSize: 13, marginBottom: 12 }}>
          Text files (.txt, .md, .csv, .json, .html…) up to 400 KB each — multiple at once.
        </div>
        <button className="btn primary sm" onClick={() => fileInputRef.current?.click()}>
          Choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.htm,.xml,.yaml,.yml,.rtf,text/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />

        {uploads.length > 0 ? (
          <div
            className="stack"
            style={{
              gap: 6,
              marginTop: 16,
              textAlign: 'left',
              maxWidth: 480,
              marginInline: 'auto',
            }}
          >
            {uploads.map((u, i) => (
              <div key={`${u.name}-${String(i)}`} className="row spread" style={{ fontSize: 13 }}>
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {u.name}
                </span>
                {u.status === 'error' ? (
                  <span style={{ color: 'var(--danger)' }}>{u.error ?? 'Failed'}</span>
                ) : u.status === 'done' ? (
                  <span
                    style={{
                      color: 'var(--ok)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Queued <Icon name="check" size={13} />
                  </span>
                ) : (
                  <span className="row" style={{ gap: 6 }}>
                    <Spinner /> {u.status === 'reading' ? 'Reading…' : 'Uploading…'}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="toolbar">
          <input
            className="input grow"
            placeholder="Search this knowledge base semantically…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          />
          <button
            className="btn primary"
            onClick={() => void runSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? <Spinner /> : 'Search'}
          </button>
        </div>
        {results !== null ? (
          results.length === 0 ? (
            <div className="dim" style={{ fontSize: 13, marginTop: 12 }}>
              No matching passages found.
            </div>
          ) : (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              {results.map((h) => (
                <div key={h.id} className="card" style={{ padding: 12 }}>
                  <div className="spread" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{h.documentTitle}</span>
                    <Chip>{(h.score * 100).toFixed(0)}% match</Chip>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }} className="muted">
                    {h.content.length > 320 ? `${h.content.slice(0, 320)}…` : h.content}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Documents */}
      {docs === null ? (
        <TableSkeleton cols={4} />
      ) : docs.length === 0 ? (
        <EmptyState
          icon="book"
          title="No documents yet"
          hint="Upload text files or paste content above. Each document is chunked and embedded so AI can retrieve it."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Status</th>
                <th>Chunks</th>
                <th>Size</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: 550 }}>{d.title}</div>
                    {d.status === 'FAILED' && d.failureReason ? (
                      <div style={{ fontSize: 11, color: 'var(--danger)' }}>{d.failureReason}</div>
                    ) : null}
                  </td>
                  <td>
                    {['PENDING', 'QUEUED', 'PROCESSING'].includes(d.status) ? (
                      <span className="row" style={{ gap: 6 }}>
                        <Spinner />
                        <StatusPill
                          status={toStatus(d.status === 'PROCESSING' ? 'PUBLISHING' : d.status)}
                        />
                      </span>
                    ) : (
                      <StatusPill
                        status={toStatus(d.status === 'READY' ? 'COMPLETED' : d.status)}
                      />
                    )}
                  </td>
                  <td>{d.chunkCount ?? 0}</td>
                  <td className="dim">{fmtBytes(d.metadata?.sizeBytes)}</td>
                  <td className="dim">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() => void reprocess(d)}
                        aria-label="Reprocess"
                      >
                        <Icon name="refresh" size={15} />
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={() => setConfirmDel(d)}
                        aria-label="Delete"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paste-text drawer replaced by a simple modal via ConfirmDialog styling */}
      {pasteOpen ? (
        <>
          <div className="overlay" onClick={() => setPasteOpen(false)} />
          <div className="modal" role="dialog" aria-label="Add document text">
            <div className="head">
              <h3>Add document</h3>
              <button className="icon-btn" onClick={() => setPasteOpen(false)} aria-label="Close">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="body">
              <Field label="Title *">
                <input
                  className="input"
                  value={pasteTitle}
                  placeholder="e.g. Return policy"
                  onChange={(e) => setPasteTitle(e.target.value)}
                />
              </Field>
              <Field label="Content *">
                <textarea
                  className="input"
                  rows={10}
                  value={pasteBody}
                  placeholder="Paste the text you want AI to learn from…"
                  onChange={(e) => setPasteBody(e.target.value)}
                />
              </Field>
            </div>
            <div className="foot">
              <button className="btn" onClick={() => setPasteOpen(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => void addPastedText()}
                disabled={pasting}
              >
                {pasting ? 'Adding…' : 'Add & index'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmDel !== null}
        title="Delete document?"
        message="This removes the document and its indexed chunks from the knowledge base."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDel && void doDelete(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </>
  )
}
