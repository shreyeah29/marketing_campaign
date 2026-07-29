import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Clock, CheckCircle2, Plus, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { socialApi } from '@/services/api'

const platforms = [
  { label: 'Facebook', color: 'text-blue-400', dot: 'bg-blue-500', followers: '12.4K' },
  { label: 'Instagram', color: 'text-pink-400', dot: 'bg-pink-500', followers: '8.9K' },
  { label: 'LinkedIn', color: 'text-sky-400', dot: 'bg-sky-500', followers: '5.2K' },
  { label: 'X (Twitter)', color: 'text-white/55', dot: 'bg-white/20', followers: '3.1K' },
  { label: 'YouTube', color: 'text-red-400', dot: 'bg-red-500', followers: '2.8K' },
]

const calendarDays = Array.from({ length: 31 }, (_, i) => i + 1)
const postsOnDay: Record<number, number> = { 29: 2, 30: 3, 31: 1, 1: 2, 3: 1, 5: 2, 7: 3, 10: 1, 14: 2 }

const platformIcon = (name: string) => {
  const p = platforms.find((p) => p.label === name || p.label.startsWith(name) || name.startsWith(p.label.split(' ')[0]))
  if (!p) return null
  return <div className={`w-3.5 h-3.5 rounded-full ${p.dot}`} />
}

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return String(iso)
  }
}

export function SocialMedia() {
  const [composing, setComposing] = useState(false)
  const [newPost, setNewPost] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [posts, setPosts] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>({})
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const [list, stats] = await Promise.all([socialApi.posts(), socialApi.analytics()])
      setPosts(list || [])
      setAnalytics(stats || {})
    } catch (err) {
      console.error(err)
      setPosts([])
      setAnalytics({})
    }
  }

  useEffect(() => {
    load()
  }, [])

  const togglePlatform = (p: string) => {
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])
  }

  const primaryPlatform = () => {
    const p = selectedPlatforms[0] || 'Facebook'
    return p.startsWith('X') ? 'X' : p
  }

  const handlePostNow = async () => {
    if (!newPost.trim() || submitting) return
    setSubmitting(true)
    try {
      await socialApi.create(primaryPlatform(), newPost, true)
      setNewPost('')
      setComposing(false)
      setSelectedPlatforms([])
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSchedule = async () => {
    if (!newPost.trim() || submitting) return
    setSubmitting(true)
    try {
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await socialApi.schedule(primaryPlatform(), newPost, scheduledAt)
      setNewPost('')
      setComposing(false)
      setSelectedPlatforms([])
      await load()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const analyticsCards = [
    { label: 'Total Reach', value: analytics.reach ? `${(Number(analytics.reach) / 1000).toFixed(1)}K` : '—', change: '+18%' },
    { label: 'Engagements', value: analytics.engagementRate != null ? `${analytics.engagementRate}%` : '—', change: '+24%' },
    { label: 'Followers', value: analytics.followers ? Number(analytics.followers).toLocaleString() : '—', change: '+31%' },
    { label: 'Posts This Week', value: analytics.postsThisWeek != null ? String(analytics.postsThisWeek) : '—', change: '+2.1%' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Platform cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {platforms.map((p, i) => {
          return (
            <motion.div key={p.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-4 text-center hover:border-white/[0.15] transition-colors cursor-pointer">
                <div className={`w-6 h-6 rounded-full ${p.dot} mx-auto mb-2`} />
                <p className="text-xs font-medium text-white/55">{p.label}</p>
                <p className="text-lg font-bold text-white mt-1">{p.followers}</p>
                <p className="text-[10px] text-white/35">followers</p>
              </Card>
            </motion.div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70">Post Queue</h3>
        <Button size="sm" variant="gradient" className="gap-1.5" onClick={() => setComposing(true)}>
          <Plus className="w-3.5 h-3.5" />
          New Post
        </Button>
      </div>

      {/* Compose */}
      {composing && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 border-indigo-500/30">
            <h3 className="text-sm font-semibold text-white mb-3">Compose Post</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {platforms.map((p) => {
                return (
                  <button
                    key={p.label}
                    onClick={() => togglePlatform(p.label)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-all ${
                      selectedPlatforms.includes(p.label) ? 'border-indigo-500/50 bg-indigo-500/10 text-white/80' : 'border-white/[0.08] text-white/35 hover:border-white/20'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                )
              })}
            </div>
            <Textarea value={newPost} onChange={(e) => setNewPost(e.target.value)} placeholder="Write your post..." className="min-h-[100px] mb-3" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSchedule} disabled={submitting}>
                <Calendar className="w-3.5 h-3.5" />Schedule
              </Button>
              <Button size="sm" variant="gradient" className="gap-1.5" onClick={handlePostNow} disabled={submitting}>
                <Send className="w-3.5 h-3.5" />Post Now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setComposing(false)}>Cancel</Button>
            </div>
          </Card>
        </motion.div>
      )}

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-3">
          {posts.filter((p) => p.status === 'scheduled').map((post, i) => (
            <motion.div key={post.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="p-4 hover:border-white/[0.15] transition-colors">
                <div className="flex items-start gap-4">
                  {post.img && <img src={post.img} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {platformIcon(post.platform)}
                      <span className="text-xs text-white/50 font-medium">{post.platform}</span>
                      <Badge variant="default" className="text-[10px]">Scheduled</Badge>
                    </div>
                    <p className="text-sm text-white/70 leading-relaxed">{post.content}</p>
                    <p className="text-xs text-white/35 mt-2 flex items-center gap-1.5"><Clock className="w-3 h-3" />{formatDate(post.scheduledAt)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs">Edit</Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="calendar">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">August 2026</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs">← Prev</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs">Next →</Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-white/35 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 4 }).map((_, i) => <div key={`empty-${i}`} />)}
              {calendarDays.map((day) => (
                <div
                  key={day}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs cursor-pointer transition-colors ${
                    day === 29 ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50' : 'hover:bg-white/5 text-white/50'
                  }`}
                >
                  <span>{day}</span>
                  {postsOnDay[day] && (
                    <div className="flex gap-0.5 mt-0.5">
                      {Array.from({ length: Math.min(postsOnDay[day], 3) }).map((_, j) => (
                        <div key={j} className="w-1 h-1 rounded-full bg-indigo-500" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="published" className="space-y-3">
          {posts.filter((p) => p.status === 'published').map((post) => (
            <Card key={post.id} className="p-4">
              <div className="flex items-start gap-4">
                {post.img && <img src={post.img} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {platformIcon(post.platform)}
                    <span className="text-xs text-white/50 font-medium">{post.platform}</span>
                    <Badge variant="success" className="text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />Published</Badge>
                  </div>
                  <p className="text-sm text-white/70">{post.content}</p>
                  <p className="text-xs text-white/35 mt-2">{formatDate(post.scheduledAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{post.engagement ?? 0}</p>
                  <p className="text-[10px] text-white/35">engagements</p>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {analyticsCards.map((stat, i) => (
              <Card key={i} className="p-4">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40 mt-1">{stat.label}</p>
                <Badge variant="success" className="mt-2 text-[10px]">{stat.change}</Badge>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
