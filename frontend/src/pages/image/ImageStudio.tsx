import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Download, Heart, Grid3X3, List, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { imagesApi } from '@/services/api'

const imageTypes = [
  { label: 'Flyer', emoji: '📄' },
  { label: 'Poster', emoji: '🖼️' },
  { label: 'Brochure', emoji: '📚' },
  { label: 'Social Post', emoji: '📱' },
  { label: 'Carousel', emoji: '🎠' },
  { label: 'Logo', emoji: '✨' },
  { label: 'Infographic', emoji: '📊' },
  { label: 'Banner', emoji: '🏷️' },
]

export function ImageStudio() {
  const [selectedType, setSelectedType] = useState('Flyer')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [gallery, setGallery] = useState<any[]>([])
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const load = async () => {
    try {
      const list = await imagesApi.list()
      setGallery(list || [])
    } catch (err) {
      console.error(err)
      setGallery([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const newImg = await imagesApi.generate(selectedType, prompt) as any
      setGallery((prev) => [newImg, ...prev])
      setPrompt('')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async (img: any) => {
    try {
      const updated = await imagesApi.like(String(img.id)) as any
      setGallery((prev) => prev.map((x) => (x.id === img.id ? { ...x, ...updated } : x)))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Generator */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">Generate Image</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {imageTypes.map((t) => (
            <button
              key={t.label}
              onClick={() => setSelectedType(t.label)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                selectedType === t.label
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/[0.15]'
              }`}
            >
              <span>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`Describe your ${selectedType} — e.g. "Professional NRI legal flyer with dark blue theme and trust icons"`}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <Button onClick={handleGenerate} disabled={loading} variant="gradient">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4 mr-2" />Generate</>}
          </Button>
        </div>

        {loading && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </motion.div>
            <div className="flex-1">
              <p className="text-xs text-white/55 font-medium">Generating {selectedType}...</p>
              <p className="text-[10px] text-white/35">AI is creating your design. This usually takes 5–15 seconds.</p>
            </div>
          </div>
        )}
      </Card>

      {/* Gallery */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70">Image Gallery <span className="text-white/35">({gallery.length})</span></h3>
        <div className="flex items-center gap-2">
          <Button size="icon" variant={view === 'grid' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => setView('grid')}>
            <Grid3X3 className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => setView('list')}>
            <List className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className={view === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4' : 'space-y-3'}>
        {gallery.map((img, i) => (
          <motion.div key={img.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
            {view === 'grid' ? (
              <Card className="overflow-hidden group cursor-pointer hover:border-white/20 transition-all">
                <div className="aspect-square overflow-hidden bg-zinc-900">
                  <img src={img.url} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-white/70 truncate">{img.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    <Badge variant="secondary" className="text-[9px] py-0">{img.type}</Badge>
                    <div className="flex gap-1">
                      <button className="text-white/20 hover:text-red-400 transition-colors" onClick={() => handleLike(img)}>
                        <Heart className="w-3 h-3" fill={img.liked ? 'currentColor' : 'none'} />
                      </button>
                      <button className="text-white/20 hover:text-white/55 transition-colors">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-4 flex items-center gap-4 hover:border-white/[0.15] transition-colors cursor-pointer">
                <img src={img.url} alt={img.title} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/80">{img.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px]">{img.type}</Badge>
                    <span className="text-xs text-white/35">{img.size}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleLike(img)}>
                    <Heart className="w-3.5 h-3.5" fill={img.liked ? 'currentColor' : 'none'} />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"><Download className="w-3 h-3 mr-1.5" />Download</Button>
                </div>
              </Card>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
