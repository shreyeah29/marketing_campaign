import { useState } from 'react'
import { motion } from 'framer-motion'
import { Video, Play, Loader2, Sparkles, Mic, Music, User, Film, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

const videoTypes = [
  { label: 'Reels / Short', icon: Video, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  { label: 'YouTube Video', icon: Tv, color: 'text-red-400', bg: 'bg-red-500/10' },
  { label: 'TikTok', icon: Film, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { label: 'Explainer', icon: Film, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { label: 'Product Demo', icon: Video, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
]

const mockVideos = [
  { id: 1, title: 'NRI Legal Services Explainer', type: 'YouTube', duration: '2:34', status: 'rendered', thumbnail: 'https://picsum.photos/seed/vid1/320/180' },
  { id: 2, title: 'VSP Law Reel — Dallas NRI', type: 'Reel', duration: '0:45', status: 'rendering', thumbnail: 'https://picsum.photos/seed/vid2/320/180' },
  { id: 3, title: 'How POA Works — Animated', type: 'Explainer', duration: '3:10', status: 'rendered', thumbnail: 'https://picsum.photos/seed/vid3/320/180' },
]

export function VideoStudio() {
  const [selectedType, setSelectedType] = useState('Explainer')
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [showScript, setShowScript] = useState(false)

  const mockScript = `[HOOK — 0-5s]
Visual: Indian family in USA looking concerned
VO: "Are you an NRI worried about your property back home?"

[PROBLEM — 5-15s]
Visual: Map from Dallas to India with question marks
VO: "Property disputes, illegal transfers, missing documents..."

[SOLUTION — 15-35s]
Visual: Lawyer on secure video call
VO: "VSP Law Associates handles India property law 100% remotely..."

[SOCIAL PROOF — 35-50s]
Visual: Client testimonial overlay, stats
VO: "500+ NRI families protected. No India trip required."

[CTA — 50-60s]
Visual: Booking page animation
VO: "Book your FREE 30-minute consultation today."`

  const handleGenerate = async () => {
    setGenerating(true)
    setRenderProgress(0)
    await new Promise((r) => setTimeout(r, 1500))
    setShowScript(true)
    setGenerating(false)
    // Simulate rendering
    let p = 0
    const interval = setInterval(() => {
      p += Math.random() * 8
      setRenderProgress(Math.min(p, 100))
      if (p >= 100) clearInterval(interval)
    }, 400)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Generator */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Video Type</h3>
            <div className="space-y-2">
              {videoTypes.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.label}
                    onClick={() => setSelectedType(t.label)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      selectedType === t.label ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-white/[0.08] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl ${t.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${t.color}`} />
                    </div>
                    <span className="text-sm text-white/55 font-medium">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Video Brief</h3>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Describe your video — target audience, key message, tone, duration..."
              className="min-h-[100px]"
            />
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { icon: Mic, label: 'Voice', value: 'Professional' },
                { icon: Music, label: 'Music', value: 'Corporate' },
                { icon: User, label: 'Avatar', value: 'Priya AI' },
              ].map((opt) => {
                const Icon = opt.icon
                return (
                  <div key={opt.label} className="p-2 rounded-lg bg-white/3 border border-white/[0.08] text-center">
                    <Icon className="w-3.5 h-3.5 mx-auto mb-1 text-white/40" />
                    <p className="text-[10px] text-white/35">{opt.label}</p>
                    <p className="text-[11px] text-white/55 font-medium">{opt.value}</p>
                  </div>
                )
              })}
            </div>
            <Button onClick={handleGenerate} disabled={generating} variant="gradient" className="w-full">
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {generating ? 'Generating Script...' : 'Generate Video'}
            </Button>
          </Card>
        </div>

        {/* Preview / Script */}
        <div className="lg:col-span-2 space-y-4">
          {showScript && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-indigo-400" />
                    Generated Script
                  </h3>
                  <Badge variant="success">Generated</Badge>
                </div>
                <pre className="text-xs text-white/50 leading-relaxed font-mono bg-black/20 rounded-lg p-4 border border-white/[0.06] whitespace-pre-wrap">{mockScript}</pre>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-white/50">Video Rendering Progress</p>
                    <span className="text-xs text-white/35">{Math.round(renderProgress)}%</span>
                  </div>
                  <Progress value={renderProgress} />
                  {renderProgress < 100 ? (
                    <p className="text-xs text-white/35">Rendering your {selectedType}... ETA ~30 seconds</p>
                  ) : (
                    <Button size="sm" variant="gradient" className="gap-2">
                      <Play className="w-3.5 h-3.5" />
                      Preview Video
                    </Button>
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {!showScript && (
            <Card className="p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/[0.08] flex items-center justify-center mb-4">
                <Video className="w-8 h-8 text-white/20" />
              </div>
              <p className="text-sm text-white/35">Select a video type and provide a brief to generate your video with AI</p>
            </Card>
          )}

          {/* Recent videos */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Recent Videos</h3>
            <div className="space-y-3">
              {mockVideos.map((vid) => (
                <div key={vid.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/3 border border-white/[0.06] hover:border-white/[0.15] transition-colors cursor-pointer">
                  <div className="relative">
                    <img src={vid.thumbnail} alt={vid.title} className="w-16 h-9 rounded-lg object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                        <Play className="w-3 h-3 text-white fill-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/80">{vid.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">{vid.type}</Badge>
                      <span className="text-xs text-white/35">{vid.duration}</span>
                    </div>
                  </div>
                  <Badge variant={vid.status === 'rendered' ? 'success' : 'warning'}>{vid.status}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
