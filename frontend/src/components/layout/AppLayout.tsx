import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

const pageTitles: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Welcome back, Sarah' },
  '/ai-command': { title: 'AI Command Center', subtitle: 'Generate full campaigns with AI' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Manage all marketing campaigns' },
  '/content': { title: 'Content Studio', subtitle: 'AI-powered content generation' },
  '/image': { title: 'Image Studio', subtitle: 'Generate marketing visuals' },
  '/video': { title: 'Video Studio', subtitle: 'Create video content with AI' },
  '/social': { title: 'Social Media', subtitle: 'Schedule and manage posts' },
  '/email': { title: 'Email Marketing', subtitle: 'Campaigns, sequences & automation' },
  '/whatsapp': { title: 'WhatsApp', subtitle: 'Conversations and campaigns' },
  '/voice': { title: 'Voice AI', subtitle: 'AI-powered call management' },
  '/crm': { title: 'CRM', subtitle: 'Contacts, leads & pipeline' },
  '/automation': { title: 'Automation', subtitle: 'Visual workflow builder' },
  '/analytics': { title: 'Analytics', subtitle: 'Performance insights & reporting' },
  '/templates': { title: 'Templates', subtitle: 'Reusable campaign templates' },
  '/settings': { title: 'Settings', subtitle: 'Organization & configuration' },
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()

  const pageInfo = Object.entries(pageTitles).find(([path]) => location.pathname.startsWith(path))?.[1]
    || { title: 'VSP AI Marketing OS' }

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={pageInfo.title} subtitle={pageInfo.subtitle} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
