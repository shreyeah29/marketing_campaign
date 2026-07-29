import { motion } from 'framer-motion'
import { LayoutTemplate, Star, Copy, Eye, Filter, Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const templates = [
  { name: 'NRI Legal Services Full Campaign', category: 'Campaign', uses: 284, stars: 4.9, type: 'AI Campaign' },
  { name: 'Real Estate Lead Generation', category: 'Campaign', uses: 192, stars: 4.7, type: 'AI Campaign' },
  { name: 'Professional Services Email Drip', category: 'Email', uses: 340, stars: 4.8, type: 'Email' },
  { name: 'LinkedIn Thought Leadership Series', category: 'Social', uses: 218, stars: 4.6, type: 'Social' },
  { name: 'Landing Page — Consultation Booking', category: 'Content', uses: 156, stars: 4.9, type: 'Content' },
  { name: 'WhatsApp NRI Outreach Script', category: 'WhatsApp', uses: 124, stars: 4.7, type: 'WhatsApp' },
  { name: 'Product Launch Announcement', category: 'Campaign', uses: 89, stars: 4.5, type: 'AI Campaign' },
  { name: 'B2B Proposal Template', category: 'Content', uses: 67, stars: 4.6, type: 'Content' },
  { name: 'Referral Marketing Campaign', category: 'Campaign', uses: 103, stars: 4.8, type: 'AI Campaign' },
]

const categoryColors: Record<string, string> = {
  Campaign: 'default',
  Email: 'default',
  Social: 'warning',
  Content: 'secondary',
  WhatsApp: 'success',
}

export function Templates() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <Input placeholder="Search templates..." className="pl-8 h-8 text-xs" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5"><Filter className="w-3 h-3" />Filter</Button>
          <Button size="sm" variant="gradient" className="h-8 text-xs gap-1.5"><Plus className="w-3 h-3" />Create Template</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-5 hover:border-indigo-500/30 transition-all cursor-pointer group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <LayoutTemplate className="w-5 h-5 text-indigo-400" />
                </div>
                <Badge variant={categoryColors[t.category] as any} className="text-[10px]">{t.type}</Badge>
              </div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">{t.name}</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-xs text-white/50">{t.stars}</span>
                </div>
                <span className="text-xs text-white/30">{t.uses} uses</span>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1.5"><Eye className="w-3 h-3" />Preview</Button>
                <Button size="sm" variant="gradient" className="flex-1 h-7 text-xs gap-1.5"><Copy className="w-3 h-3" />Use</Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
