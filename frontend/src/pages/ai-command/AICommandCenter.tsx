import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, Save, Copy, ChevronDown, ChevronUp, Zap, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { MockAIService, type CampaignSection } from '@/services/mock-ai'
import { aiApi } from '@/services/api'
import { cn } from '@/lib/utils'

const sectionIcons: Record<string, string> = {
  strategy: '🎯', audience: '👥', budget: '💰', facebook: '📘',
  instagram: '📸', linkedin: '💼', 'google-ads': '🔍', blog: '✍️',
  email: '📧', whatsapp: '💬', video: '🎬', 'landing-page': '🖥️',
  seo: '📈', cta: '🚀',
}

const sectionColors: Record<string, string> = {
  strategy: 'border-indigo-500/[0.18] bg-indigo-500/[0.04]',
  audience: 'border-violet-500/[0.18] bg-violet-500/[0.04]',
  budget: 'border-emerald-500/[0.18] bg-emerald-500/[0.04]',
  facebook: 'border-blue-500/[0.18] bg-blue-500/[0.04]',
  instagram: 'border-pink-500/[0.18] bg-pink-500/[0.04]',
  linkedin: 'border-cyan-500/[0.18] bg-cyan-500/[0.04]',
  'google-ads': 'border-yellow-500/[0.18] bg-yellow-500/[0.04]',
  blog: 'border-orange-500/[0.18] bg-orange-500/[0.04]',
  email: 'border-teal-500/[0.18] bg-teal-500/[0.04]',
  whatsapp: 'border-green-500/[0.18] bg-green-500/[0.04]',
  video: 'border-red-500/[0.18] bg-red-500/[0.04]',
  'landing-page': 'border-purple-500/[0.18] bg-purple-500/[0.04]',
  seo: 'border-lime-500/[0.18] bg-lime-500/[0.04]',
  cta: 'border-amber-500/[0.18] bg-amber-500/[0.04]',
}

const promptSuggestions = [
  'Create a campaign for VSP Law Associates targeting NRIs in Dallas.',
  'Generate a complete digital marketing strategy for a healthcare startup launching in Mumbai.',
  'Build a lead generation campaign for a luxury real estate developer in Dubai targeting HNIs.',
  'Create a 90-day content marketing plan for a B2B SaaS product targeting CTOs.',
]

function SectionCard({ section, index }: { section: CampaignSection; index: number }) {
  const [expanded, setExpanded] = useState(index < 3)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const handleCopy = () => {
    navigator.clipboard.writeText(section.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <div className={cn(
        'rounded-2xl border overflow-hidden',
        'shadow-[0_1px_3px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.15)]',
        'transition-all duration-200',
        sectionColors[section.id] || 'border-white/[0.08] bg-white/[0.02]',
      )}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
        >
          <span className="text-base shrink-0">{sectionIcons[section.id] || '📄'}</span>
          <span className="font-semibold text-white/85 text-[13px] flex-1 text-left">{section.title}</span>
          <div className="flex items-center gap-2 shrink-0">
            {saved && <Badge variant="success" className="text-[10px]">Saved</Badge>}
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-white/25" />
              : <ChevronDown className="w-3.5 h-3.5 text-white/25" />
            }
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 border-t border-white/[0.05]">
                <div className="mt-3 text-[11px] text-white/55 leading-relaxed whitespace-pre-wrap bg-black/20 rounded-xl p-3.5 border border-white/[0.05] mb-3 font-mono">
                  {section.content}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSave}>
                    {saved ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
                    {saved ? 'Saved!' : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCopy}>
                    {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400 hover:text-indigo-300">
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export function AICommandCenter() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<CampaignSection[]>([])
  const [summary, setSummary] = useState('')
  const [progress, setProgress] = useState(0)
  const [savingAll, setSavingAll] = useState(false)
  const [savedAll, setSavedAll] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setSections([])
    setSummary('')
    setProgress(0)
    setSavedAll(false)

    // Animate progress
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 90))
    }, 200)

    try {
      const result = await MockAIService.generateCampaign(prompt)
      clearInterval(interval)
      setProgress(100)
      setTimeout(() => {
        setSummary(result.summary)
        setSections(result.sections)
        setLoading(false)
        setProgress(0)
      }, 300)
    } catch (err) {
      console.error(err)
      clearInterval(interval)
      setLoading(false)
      setProgress(0)
    }
  }

  const handleSaveAll = async () => {
    if (!sections.length || savingAll) return
    setSavingAll(true)
    try {
      await aiApi.saveCampaign({
        name: prompt.slice(0, 80) || 'AI Generated Campaign',
        summary,
        sections,
      })
      setSavedAll(true)
      setTimeout(() => setSavedAll(false), 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setSavingAll(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
  }

  return (
    <div className="flex h-[calc(100vh-60px)]">
      {/* Input Panel */}
      <div className="w-full lg:w-[400px] flex flex-col border-r border-white/[0.06] shrink-0 bg-[#0a0a0f]">
        {/* Hero */}
        <div className="p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.4)]">
              <Sparkles className="w-[17px] h-[17px] text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">AI Command Center</p>
              <p className="text-[10px] text-indigo-400/80 leading-tight">Powered by VSP AI Engine</p>
            </div>
          </div>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Describe your business and goals. Our AI generates a complete 360° campaign — strategy, ads, content, SEO, and more.
          </p>
        </div>

        {/* Prompt area */}
        <div className="p-4 flex-1 flex flex-col gap-3 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-white/40 mb-1.5 block tracking-wide">Campaign brief</label>
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Create a campaign for VSP Law Associates targeting NRIs in Dallas..."
              className="min-h-[120px] text-sm"
            />
            <p className="text-[10px] text-white/20 mt-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/[0.07] rounded text-[10px] font-semibold text-white/30">⌘</span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/[0.07] rounded text-[10px] font-semibold text-white/30">↵</span>
              to generate
            </p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            variant="gradient"
            size="lg"
            className="w-full"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Generating campaign...</>
            ) : (
              <><Zap className="w-4 h-4" />Generate Full Campaign</>
            )}
          </Button>

          {loading && (
            <div className="space-y-2 p-3 rounded-xl bg-indigo-500/[0.06] border border-indigo-500/[0.15]">
              <div className="flex justify-between text-[11px]">
                <span className="text-indigo-300/70 font-medium">Crafting your campaign...</span>
                <span className="text-white/40 tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="h-1 bg-white/[0.07] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.15 }}
                />
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-[0.08em] mb-2.5">
              Try these prompts
            </p>
            <div className="space-y-1.5">
              {promptSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(s)}
                  className="w-full text-left text-[11px] text-white/40 hover:text-white/65 px-3 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all duration-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[{ val: '14', label: 'Sections' }, { val: '~2s', label: 'Gen time' }, { val: '500+', label: 'Campaigns' }].map((s) => (
              <div key={s.label} className="py-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                <p className="text-sm font-bold text-white tabular-nums">{s.val}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results Panel */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {!loading && sections.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-white/60 mb-2">Your campaign will appear here</h3>
              <p className="text-sm text-white/30 max-w-sm">
                Enter a prompt and click "Generate Full Campaign" to create a complete 360° marketing strategy with 14 sections.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs">
                {['Campaign Strategy', 'Facebook Ads', 'Email Sequences', 'SEO Content', 'Video Scripts', 'WhatsApp Campaigns'].map((f) => (
                  <div key={f} className="text-xs text-white/20 flex items-center gap-1.5 p-2 rounded-lg bg-white/3 border border-white/6">
                    <div className="w-1 h-1 rounded-full bg-indigo-500/50" />
                    {f}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="w-10 h-10 text-indigo-400" />
                </motion.div>
              </div>
              <p className="text-lg font-semibold text-white mb-2">Crafting your campaign...</p>
              <p className="text-sm text-white/40 text-center max-w-sm">
                Our AI is analyzing your brief and generating a comprehensive 360° marketing strategy across 14 channels.
              </p>
              <div className="mt-8 space-y-2 w-64">
                {['Analyzing target audience...', 'Building campaign strategy...', 'Generating ad copies...', 'Crafting content plan...'].map((step, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.3 }}
                    className="flex items-center gap-2 text-xs text-white/40"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/60 animate-pulse" />
                    {step}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {!loading && sections.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Summary bar */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Campaign Generated Successfully</p>
                    <p className="text-xs text-white/40">{summary}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success">{sections.length} sections</Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveAll} disabled={savingAll}>
                    <Save className="w-3 h-3 mr-1.5" />
                    {savedAll ? 'Saved!' : savingAll ? 'Saving...' : 'Save All'}
                  </Button>
                </div>
              </div>

              {/* Sections */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {sections.map((section, i) => (
                  <SectionCard key={section.id} section={section} index={i} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
