import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Zap, Megaphone, FileText, Image, Video,
  Share2, Mail, MessageCircle, Phone, Users, GitBranch,
  BarChart3, LayoutTemplate, Settings, ChevronLeft, ChevronRight,
  Sparkles, Building2, ChevronUp
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
        animate={{ width: collapsed ? 64 : 248 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'relative flex flex-col h-screen shrink-0 overflow-hidden',
          'bg-[#0a0a0f]',
          'border-r border-white/[0.06]',
          'shadow-[1px_0_0_rgba(255,255,255,0.04)]',
        )}
      >
        {/* Subtle top gradient */}
        <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-indigo-950/20 to-transparent pointer-events-none" />

        {/* Logo */}
        <div className={cn(
          'relative flex items-center h-16 shrink-0',
          'border-b border-white/[0.06]',
          collapsed ? 'justify-center px-4' : 'px-4 gap-3'
        )}>
          <div className={cn(
            'flex items-center justify-center shrink-0',
            'w-8 h-8 rounded-xl',
            'bg-gradient-to-br from-indigo-500 to-violet-600',
            'shadow-[0_2px_8px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]',
          )}>
            <Sparkles className="w-[15px] h-[15px] text-white" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <p className="font-bold text-white text-[13px] leading-tight tracking-tight whitespace-nowrap">
                  VSP AI
                </p>
                <p className="text-[10px] text-indigo-400/80 leading-tight whitespace-nowrap font-medium">
                  Marketing OS
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <div className="relative flex-1 overflow-y-auto py-2 scrollbar-none">
          <nav className="space-y-px px-2">
            {navItems.map((item, i) => {
              if ('divider' in item && item.divider) {
                return (
                  <AnimatePresence key={`div-${i}`}>
                    {!collapsed ? (
                      <motion.div
                        key="label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="px-3 pt-5 pb-1.5"
                      >
                        <p className="text-[10px] font-semibold text-white/[0.18] uppercase tracking-[0.1em]">
                          {item.label}
                        </p>
                      </motion.div>
                    ) : (
                      <div key="spacer" className="h-4 flex items-center justify-center mx-2">
                        <div className="w-4 h-px bg-white/[0.08]" />
                      </div>
                    )}
                  </AnimatePresence>
                )
              }

              const Icon = item.icon!
              const isActive = location.pathname === item.href ||
                (item.href !== '/dashboard' && location.pathname.startsWith(item.href + '/'))

              const navLink = (
                <Link
                  key={`link-${i}`}
                  to={item.href!}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl text-sm',
                    'transition-all duration-200 ease-out group',
                    'px-3 py-2.5',
                    collapsed && 'justify-center px-0 py-2.5 mx-auto w-10 h-10',
                    isActive
                      ? [
                          'bg-indigo-600/[0.15] text-indigo-300',
                          'shadow-[inset_0_1px_0_rgba(99,102,241,0.1)]',
                        ].join(' ')
                      : item.highlight
                        ? 'text-indigo-400/80 hover:text-indigo-300 hover:bg-indigo-500/[0.08]'
                        : 'text-white/35 hover:text-white/75 hover:bg-white/[0.05]',
                  )}
                >
                  {/* Active left bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}

                  {/* Icon */}
                  <Icon className={cn(
                    'shrink-0 transition-transform duration-200',
                    collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]',
                    isActive && 'text-indigo-400',
                    !isActive && !item.highlight && 'group-hover:scale-110',
                  )} />

                  {/* Label */}
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-nowrap font-medium text-[13px] flex-1"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* AI Badge */}
                  {item.highlight && !collapsed && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        'ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wide',
                        'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30',
                      )}
                    >
                      AI
                    </motion.span>
                  )}
                </Link>
              )

              if (collapsed) {
                return (
                  <Tooltip key={`tooltip-${i}`}>
                    <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                )
              }
              return navLink
            })}
          </nav>
        </div>

        {/* Org switcher */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="p-3 border-t border-white/[0.06]"
            >
              <div className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer',
                'hover:bg-white/[0.05] transition-all duration-200',
                'border border-transparent hover:border-white/[0.07]',
                'group',
              )}>
                <div className={cn(
                  'w-7 h-7 rounded-lg shrink-0',
                  'bg-gradient-to-br from-indigo-500/30 to-violet-500/20',
                  'border border-indigo-500/20',
                  'flex items-center justify-center',
                )}>
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/70 truncate leading-tight">VSP Law Associates</p>
                  <p className="text-[10px] text-white/30 leading-tight">Pro Plan · 4 members</p>
                </div>
                <ChevronUp className="w-3 h-3 text-white/20 group-hover:text-white/40 transition-colors" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className={cn(
            'absolute -right-3 top-[68px] z-50',
            'w-6 h-6 rounded-full',
            'bg-zinc-900 border border-white/[0.1]',
            'flex items-center justify-center',
            'text-white/40 hover:text-white/80',
            'shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
            'transition-all duration-200 hover:scale-110',
          )}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronLeft className="w-3 h-3" />
          }
        </button>
      </motion.div>
    </TooltipProvider>
  )
}
