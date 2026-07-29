import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Good morning, Sarah' },
  '/ai-command': { title: 'AI Command Center', subtitle: 'Generate full campaigns with a single prompt' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Manage and track all marketing campaigns' },
  '/content': { title: 'Content Studio', subtitle: 'AI-powered content generation across all formats' },
  '/image': { title: 'Image Studio', subtitle: 'Generate premium marketing visuals with AI' },
  '/video': { title: 'Video Studio', subtitle: 'Create video content, scripts & storyboards' },
  '/social': { title: 'Social Media', subtitle: 'Schedule, publish and analyze across all platforms' },
  '/email': { title: 'Email Marketing', subtitle: 'Campaigns, sequences & automated drip flows' },
  '/whatsapp': { title: 'WhatsApp', subtitle: 'Conversations, broadcasts & lead nurturing' },
  '/voice': { title: 'Voice AI', subtitle: 'Automated AI call management & transcripts' },
  '/crm': { title: 'CRM', subtitle: 'Contacts, leads, pipeline & activity timeline' },
  '/automation': { title: 'Automation', subtitle: 'Visual workflow builder with execution logs' },
  '/analytics': { title: 'Analytics', subtitle: 'Performance insights, ROI & AI recommendations' },
  '/templates': { title: 'Templates', subtitle: 'Reusable campaign & content templates' },
  '/settings': { title: 'Settings', subtitle: 'Organization configuration & integrations' },
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const pageInfo = Object.entries(pageTitles).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || { title: 'VSP AI Marketing OS' }

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-600/[0.03] rounded-full blur-3xl" />
      </div>

      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header title={pageInfo.title} subtitle={pageInfo.subtitle} />
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 overflow-y-auto"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  )
}
