import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Mail, Globe, Search, MessageSquare, Package, Newspaper, FileCheck, Sparkles, Loader2, Save, Copy, RefreshCw, Clock, ChevronRight, Share2, AtSign, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MockAIService } from '@/services/mock-ai'

const contentTypes = [
  { icon: FileText, label: 'Blog Post', type: 'blog', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  { icon: Mail, label: 'Email', type: 'email', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { icon: Globe, label: 'Landing Page', type: 'landing', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { icon: Share2, label: 'Facebook Ad', type: 'facebook', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { icon: Search, label: 'Google Ad', type: 'google', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { icon: Zap, label: 'LinkedIn Post', type: 'linkedin', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  { icon: AtSign, label: 'Instagram Caption', type: 'instagram', color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { icon: MessageSquare, label: 'X Post', type: 'x', color: 'text-white/60', bg: 'bg-white/5' },
  { icon: MessageSquare, label: 'SMS', type: 'sms', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { icon: Package, label: 'Product Description', type: 'product', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { icon: Newspaper, label: 'Press Release', type: 'press', color: 'text-red-400', bg: 'bg-red-500/10' },
  { icon: FileCheck, label: 'Proposal', type: 'proposal', color: 'text-teal-400', bg: 'bg-teal-500/10' },
]

const recentDrafts = [
  { title: 'NRI Property Rights Guide 2024', type: 'Blog Post', date: '2h ago', status: 'draft' },
  { title: 'Welcome Email — NRI Series', type: 'Email', date: '5h ago', status: 'saved' },
  { title: 'VSP Dallas Landing Page', type: 'Landing Page', date: 'Yesterday', status: 'published' },
  { title: 'LinkedIn Thought Leadership', type: 'LinkedIn Post', date: '2 days ago', status: 'published' },
]

export function ContentStudio() {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [brief, setBrief] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!selectedType || !brief.trim()) return
    setLoading(true)
    const result = await MockAIService.generateContent(selectedType, brief)
    setContent(result)
    setLoading(false)
  }

  const selectedTypeInfo = contentTypes.find((c) => c.type === selectedType)

  return (
    <div className="p-6 space-y-6">
      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate">Generate Content</TabsTrigger>
          <TabsTrigger value="drafts">Drafts & History</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="generate">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Type selector */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white/70 mb-3">Content Type</h3>
                <div className="grid grid-cols-2 gap-2">
                  {contentTypes.map((ct) => {
                    const Icon = ct.icon
                    return (
                      <button
                        key={ct.type}
                        onClick={() => setSelectedType(ct.type)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          selectedType === ct.type
                            ? 'border-indigo-500/50 bg-indigo-500/10'
                            : 'border-white/8 bg-white/3 hover:border-white/15'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg ${ct.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-3.5 h-3.5 ${ct.color}`} />
                        </div>
                        <span className="text-xs font-medium text-white/60">{ct.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedType && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-white/50 mb-1.5 block">Brief / Topic</label>
                    <Textarea
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      placeholder={`Describe what you need for your ${selectedTypeInfo?.label}...`}
                      className="min-h-[100px]"
                    />
                  </div>
                  <Button onClick={handleGenerate} disabled={!brief.trim() || loading} variant="gradient" className="w-full">
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    {loading ? 'Generating...' : `Generate ${selectedTypeInfo?.label}`}
                  </Button>
                </motion.div>
              )}
            </div>

            {/* Right: Editor */}
            <div className="lg:col-span-2">
              <Card className="h-full min-h-[500px] flex flex-col">
                <CardHeader className="flex-row items-center justify-between border-b border-white/8 pb-4">
                  <div className="flex items-center gap-2">
                    {selectedTypeInfo && (
                      <Badge variant="default" className="text-xs">{selectedTypeInfo.label}</Badge>
                    )}
                    {content && <Badge variant="success" className="text-xs">Generated</Badge>}
                  </div>
                  {content && (
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigator.clipboard.writeText(content)}>
                        <Copy className="w-3 h-3 mr-1.5" />Copy
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Save className="w-3 h-3 mr-1.5" />Save Draft
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-400" onClick={handleGenerate}>
                        <RefreshCw className="w-3 h-3 mr-1.5" />Regenerate
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex-1 p-4">
                  {loading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4">
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <Sparkles className="w-10 h-10 text-indigo-400" />
                      </motion.div>
                      <p className="text-sm text-white/40">Generating your {selectedTypeInfo?.label}...</p>
                    </div>
                  ) : content ? (
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="w-full h-full bg-transparent text-sm text-white/70 resize-none focus:outline-none leading-relaxed font-mono"
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="w-14 h-14 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center mb-3">
                        <FileText className="w-6 h-6 text-white/20" />
                      </div>
                      <p className="text-sm text-white/30">Select a content type and describe your brief to generate content</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts">
          <div className="space-y-3">
            {recentDrafts.map((draft, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4 hover:border-white/15 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-white/40" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white/80">{draft.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[10px]">{draft.type}</Badge>
                          <span className="text-[10px] text-white/30 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{draft.date}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={draft.status === 'published' ? 'success' : draft.status === 'saved' ? 'default' : 'secondary'}>
                        {draft.status}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {['NRI Legal Email Series', 'Product Launch Blog', 'B2B LinkedIn Outreach', 'E-commerce Product Descriptions', 'SaaS Onboarding Email', 'Real Estate Landing Page'].map((t, i) => (
              <Card key={i} className="p-4 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-indigo-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px]">Template</Badge>
                </div>
                <p className="text-sm font-medium text-white/80 mb-1">{t}</p>
                <p className="text-xs text-white/30">Click to use this template</p>
                <Button size="sm" variant="outline" className="mt-3 w-full h-7 text-xs group-hover:border-indigo-500/40 group-hover:text-indigo-300">
                  Use Template
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
