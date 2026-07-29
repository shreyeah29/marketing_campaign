import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, Save, Copy, ChevronDown, ChevronUp, Zap, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MockAIService, type CampaignSection } from '@/services/mock-ai'
import { cn } from '@/lib/utils'

const sectionIcons: Record<string, string> = {
  strategy: '🎯', audience: '👥', budget: '💰', facebook: '📘',
  instagram: '📸', linkedin: '💼', 'google-ads': '🔍', blog: '✍️',
  email: '📧', whatsapp: '💬', video: '🎬', 'landing-page': '🖥️',
  seo: '📈', cta: '🚀',
}

const sectionColors: Record<string, string> = {
  strategy: 'border-indigo-500/30 bg-indigo-500/5',
  audience: 'border-violet-500/30 bg-violet-500/5',
  budget: 'border-emerald-500/30 bg-emerald-500/5',
  facebook: 'border-blue-500/30 bg-blue-500/5',
  instagram: 'border-pink-500/30 bg-pink-500/5',
  linkedin: 'border-cyan-500/30 bg-cyan-500/5',
  'google-ads': 'border-yellow-500/30 bg-yellow-500/5',
  blog: 'border-orange-500/30 bg-orange-500/5',
  email: 'border-teal-500/30 bg-teal-500/5',
  whatsapp: 'border-green-500/30 bg-green-500/5',
  video: 'border-red-500/30 bg-red-500/5',
  'landing-page': 'border-purple-500/30 bg-purple-500/5',
  seo: 'border-lime-500/30 bg-lime-500/5',
  cta: 'border-amber-500/30 bg-amber-500/5',
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
      <Card className={cn('overflow-hidden border transition-all duration-200', sectionColors[section.id] || 'border-white/8')}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/3 transition-colors"
        >
          <span className="text-lg">{sectionIcons[section.id] || '📄'}</span>
          <span className="font-semibold text-white text-sm flex-1">{section.title}</span>
          <div className="flex items-center gap-2">
            {saved && <Badge variant="success" className="text-[10px]">Saved</Badge>}
            {expanded ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                <div className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap font-mono text-xs bg-black/20 rounded-lg p-4 border border-white/6 mb-3">
                  {section.content}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleSave}>
                    {saved ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
                    {saved ? 'Saved!' : 'Save'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleCopy}>
                    {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-indigo-400">
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}

export function AICommandCenter() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<CampaignSection[]>([])
  const [summary, setSummary] = useState('')
  const [progress, setProgress] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setSections([])
    setSummary('')
    setProgress(0)

    // Animate progress
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 90))
    }, 200)

    const result = await MockAIService.generateCampaign(prompt)
    clearInterval(interval)
    setProgress(100)
    setTimeout(() => {
      setSummary(result.summary)
      setSections(result.sections)
      setLoading(false)
      setProgress(0)
    }, 300)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Input Panel */}
      <div className="w-full lg:w-[420px] flex flex-col border-r border-white/6 shrink-0">
        {/* Hero */}
        <div className="p-6 border-b border-white/6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">AI Command Center</p>
              <p className="text-[10px] text-indigo-400">Powered by VSP AI Engine</p>
            </div>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Describe your business and goals. Our AI will generate a complete 360° marketing campaign — strategy, ads, content, SEO, and more.
          </p>
        </div>

        {/* Prompt area */}
        <div className="p-4 flex-1 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-white/50 mb-1.5 block">Your prompt</label>
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Create a campaign for VSP Law Associates targeting NRIs in Dallas..."
              className="min-h-[120px] text-sm resize-none"
            />
            <p className="text-[10px] text-white/20 mt-1">Press Cmd+Enter to generate</p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            variant="gradient"
            size="lg"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating campaign...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Generate Full Campaign
              </>
            )}
          </Button>

          {loading && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-white/30">
                <span>AI is crafting your campaign...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2">Try these prompts</p>
            <div className="space-y-2">
              {promptSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(s)}
                  className="w-full text-left text-xs text-white/40 hover:text-white/70 p-2.5 rounded-lg bg-white/3 border border-white/6 hover:border-white/15 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="p-4 border-t border-white/6">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[{ val: '14', label: 'Sections' }, { val: '~1.8s', label: 'Gen time' }, { val: '500+', label: 'Campaigns' }].map((s) => (
              <div key={s.label}>
                <p className="text-sm font-bold text-white">{s.val}</p>
                <p className="text-[10px] text-white/30">{s.label}</p>
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
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <Save className="w-3 h-3 mr-1.5" />
                    Save All
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
