import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutTemplate, Star, Copy, Eye, Filter, Search, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, Field } from '@/components/ui/dialog'
import { templatesApi } from '@/services/api'

const categoryColors: Record<string, string> = {
  Campaign: 'default',
  Email: 'default',
  Social: 'warning',
  Content: 'secondary',
  WhatsApp: 'success',
}

export function Templates() {
  const [search, setSearch] = useState('')
  const [templates, setTemplates] = useState<any[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', category: '' })

  const load = async (q?: string) => {
    try {
      const list = await templatesApi.list(q || undefined)
      setTemplates(list || [])
    } catch (err) {
      console.error(err)
      setTemplates([])
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const handleUse = async (id: string) => {
    try {
      const updated = await templatesApi.use(id) as any
      setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...updated } : t)))
    } catch (err) {
      console.error(err)
    }
  }

  const openDialog = () => {
    setForm({ name: '', category: '' })
    setDialogOpen(true)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (creating || !form.name.trim()) return
    setCreating(true)
    try {
      await templatesApi.create(form.name.trim(), form.category.trim() || undefined)
      setDialogOpen(false)
      setForm({ name: '', category: '' })
      await load(search)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to create template')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35" />
          <Input
            placeholder="Search templates..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Filter className="w-3 h-3" />Filter</Button>
          <Button size="sm" variant="gradient" className="h-8 text-xs gap-1.5" onClick={openDialog}>
            <Plus className="w-3 h-3" />Create Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t, i) => (
          <motion.div key={t.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-5 hover:border-indigo-500/30 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <LayoutTemplate className="w-5 h-5 text-indigo-400" />
                </div>
                <Badge variant={categoryColors[t.category] as any} className="text-[10px]">{t.type || t.category}</Badge>
              </div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">{t.name}</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs text-white/50">{t.stars ?? 4.8}</span>
                </div>
                <span className="text-xs text-white/35">{t.uses ?? 0} uses</span>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1.5"><Eye className="w-3 h-3" />Preview</Button>
                <Button size="sm" variant="gradient" className="flex-1 h-7 text-xs gap-1.5" onClick={() => handleUse(String(t.id))}>
                  <Copy className="w-3 h-3" />Use
                </Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => !creating && setDialogOpen(false)}
        title="Create Template"
        description="Add a reusable template for campaigns, email, or social."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="NRI Welcome Email"
              required
            />
          </Field>
          <Field label="Category">
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Campaign, Email, Social…"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" size="sm" disabled={creating || !form.name.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Template'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
