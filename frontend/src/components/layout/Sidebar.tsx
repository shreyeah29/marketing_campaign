import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Zap, Megaphone, FileText, Image, Video,
  Share2, Mail, MessageCircle, Phone, Users, GitBranch,
  BarChart3, LayoutTemplate, Settings, ChevronLeft, ChevronRight,
  Sparkles, Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Zap, label: 'AI Command Center', href: '/ai-command', highlight: true },
  { divider: true, label: 'Marketing' },
  { icon: Megaphone, label: 'Campaigns', href: '/campaigns' },
  { icon: FileText, label: 'Content Studio', href: '/content' },
  { icon: Image, label: 'Image Studio', href: '/image' },
  { icon: Video, label: 'Video Studio', href: '/video' },
  { icon: Share2, label: 'Social Media', href: '/social' },
  { icon: Mail, label: 'Email Marketing', href: '/email' },
  { icon: MessageCircle, label: 'WhatsApp', href: '/whatsapp' },
  { icon: Phone, label: 'Voice AI', href: '/voice' },
  { divider: true, label: 'Business' },
  { icon: Users, label: 'CRM', href: '/crm' },
  { icon: GitBranch, label: 'Automation', href: '/automation' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { divider: true, label: 'System' },
  { icon: LayoutTemplate, label: 'Templates', href: '/templates' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()

  return (
    <TooltipProvider delayDuration={0}>
      <motion.div
        initial={false}
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="relative flex flex-col h-screen bg-zinc-950 border-r border-white/6 overflow-hidden shrink-0"
      >
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-white/6 shrink-0', collapsed ? 'justify-center' : 'gap-3')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <p className="font-bold text-white text-sm leading-tight whitespace-nowrap">VSP AI</p>
                <p className="text-[10px] text-indigo-400 leading-tight whitespace-nowrap">Marketing OS</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-3 scrollbar-none">
          {navItems.map((item, i) => {
            if ('divider' in item && item.divider) {
              return (
                <AnimatePresence key={i}>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="px-4 pt-4 pb-1"
                    >
                      <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest">{item.label}</p>
                    </motion.div>
                  )}
                  {collapsed && <div className="h-3" key={`${i}-spacer`} />}
                </AnimatePresence>
              )
            }

            const Icon = item.icon!
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')

            const navLink = (
              <Link
                key={i}
                to={item.href!}
                className={cn(
                  'flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 group relative',
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-white/40 hover:text-white/80 hover:bg-white/5',
                  item.highlight && !isActive && 'text-indigo-400 hover:text-indigo-300',
                  collapsed && 'justify-center px-2'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-full"
                  />
                )}
                <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="whitespace-nowrap font-medium"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {item.highlight && !collapsed && (
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">AI</span>
                )}
              </Link>
            )

            if (collapsed) {
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }
            return navLink
          })}
        </div>

        {/* Org switcher */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-3 border-t border-white/6"
            >
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer">
                <div className="w-6 h-6 rounded-md bg-indigo-600/30 flex items-center justify-center shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white/70 truncate">VSP Law Associates</p>
                  <p className="text-[10px] text-white/30">Pro Plan</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[72px] w-6 h-6 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </motion.div>
    </TooltipProvider>
  )
}
