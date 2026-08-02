'use client'

import { useEffect, useState } from 'react'

import { ApiError, api } from '@/lib/api'
import { useToast } from '@/components/kit'
import { Spinner } from '@/components/ui'
import { Icon } from '@/components/icon'

import { TEMPLATE_CATEGORY } from './constants'
import type { Campaign } from './types'

interface PromptTemplate {
  id: string
  name: string
  description?: string | null
  category?: string | null
}

export function TemplatePicker({ onPick }: { onPick: (text: string) => void }) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])

  useEffect(() => {
    api
      .get<{ data: PromptTemplate[] } | PromptTemplate[]>('/prompts')
      .then((r) => {
        const all = Array.isArray(r) ? r : (r.data ?? [])
        setTemplates(all.filter((t) => t.category === TEMPLATE_CATEGORY && t.description))
      })
      .catch(() => setTemplates([]))
  }, [])

  if (templates.length === 0) return null

  return (
    <div style={{ marginTop: 26 }}>
      <div
        className="dim"
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 10,
        }}
      >
        Start from a template
      </div>
      <div className="chips" style={{ marginTop: 0 }}>
        {templates.slice(0, 8).map((t) => (
          <button
            key={t.id}
            className="chip"
            title={t.description ?? ''}
            onClick={() => onPick(t.description ?? '')}
          >
            <Icon name="copy" size={13} /> {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SaveTemplateButton({ campaign }: { campaign: Campaign }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const description = [
        campaign.objective,
        campaign.strategy?.summary,
        campaign.targetAudience?.description
          ? `Audience: ${campaign.targetAudience.description}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000)
      await api.post('/prompts', {
        name: campaign.name.slice(0, 200),
        category: TEMPLATE_CATEGORY,
        description: description || campaign.name,
        isShared: true,
      })
      setSaved(true)
      toast.push('success', 'Saved — it now appears as a template on the campaign studio')
    } catch (e) {
      toast.push('error', e instanceof ApiError ? e.message : 'Could not save template')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button className="btn sm" disabled={busy || saved} onClick={() => void save()}>
      {busy ? <Spinner /> : saved ? 'Saved as template' : 'Save as template'}
    </button>
  )
}
