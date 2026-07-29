import { Bell, Search, ChevronDown, Command, Plus } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  subtitle?: string
}

const notifications = [
  { title: 'Campaign live', desc: 'NRI Dallas campaign started successfully', time: '2m ago', color: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { title: 'New lead', desc: 'Rahul Sharma submitted the consultation form', time: '15m ago', color: 'bg-indigo-500', dot: 'bg-indigo-500' },
  { title: 'AI job complete', desc: 'Video script generation finished', time: '1h ago', color: 'bg-violet-500', dot: 'bg-violet-500' },
  { title: 'Budget alert', desc: 'Facebook ad spend at 85% of daily budget', time: '3h ago', color: 'bg-amber-500', dot: 'bg-amber-500' },
]

export function Header({ title, subtitle }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className={cn(
      'h-[60px] flex items-center px-6 gap-3 shrink-0',
      'bg-[#0a0a0f]/90 backdrop-blur-2xl',
      'border-b border-white/[0.06]',
      'shadow-[0_1px_0_rgba(255,255,255,0.04)]',
      'sticky top-0 z-20',
    )}>
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-white text-[15px] leading-tight tracking-tight truncate">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-[11px] text-white/35 leading-tight mt-0.5 font-medium">{subtitle}</p>
        )}
      </div>

      {/* Search */}
      <button className={cn(
        'hidden md:flex items-center gap-2.5 h-8',
        'px-3 rounded-xl',
        'bg-white/[0.04] border border-white/[0.08]',
        'text-white/30 hover:text-white/55',
        'text-xs font-medium',
        'transition-all duration-200',
        'hover:bg-white/[0.06] hover:border-white/[0.12]',
        'group',
      )}>
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span>Search...</span>
        <div className={cn(
          'ml-8 flex items-center gap-0.5',
          'px-1.5 py-0.5 rounded-md',
          'bg-white/[0.07] border border-white/[0.08]',
          'text-[10px] font-semibold text-white/30',
        )}>
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </button>

      {/* Quick action */}
      <Button size="sm" variant="gradient" className="hidden md:flex h-8 text-xs">
        <Plus className="w-3.5 h-3.5" />
        New
      </Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(
            'relative flex items-center justify-center',
            'w-8 h-8 rounded-xl',
            'text-white/45 hover:text-white/80',
            'hover:bg-white/[0.06]',
            'transition-all duration-200',
            'border border-transparent hover:border-white/[0.08]',
          )}>
            <Bell className="w-[15px] h-[15px]" />
            <span className={cn(
              'absolute top-1.5 right-1.5',
              'w-[7px] h-[7px] rounded-full',
              'bg-indigo-500',
              'ring-[1.5px] ring-[#0a0a0f]',
              'shadow-[0_0_6px_rgba(99,102,241,0.8)]',
            )} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[320px] p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
            <span className="text-sm font-semibold text-white">Notifications</span>
            <Badge variant="default" className="text-[10px]">4 new</Badge>
          </div>
          <div className="py-1">
            {notifications.map((n, i) => (
              <button
                key={i}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3',
                  'hover:bg-white/[0.04] transition-colors',
                  'text-left group',
                )}
              >
                <div className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', n.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white/80">{n.title}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{n.time}</span>
                  </div>
                  <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">{n.desc}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-white/[0.07]">
            <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              View all notifications →
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(
            'flex items-center gap-2.5 h-8',
            'px-2 rounded-xl',
            'hover:bg-white/[0.06]',
            'border border-transparent hover:border-white/[0.08]',
            'transition-all duration-200',
            'group',
          )}>
            <Avatar className="w-6 h-6 ring-0">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-[10px] font-bold">
                {user?.name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-white/75 leading-tight">
                {user?.name?.split(' ')[0] || 'User'}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 text-white/30 group-hover:text-white/50 transition-colors" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <div className="px-3 py-2.5 border-b border-white/[0.07]">
            <p className="text-xs font-semibold text-white/80">{user?.name}</p>
            <p className="text-[11px] text-white/35 mt-0.5">{user?.email}</p>
          </div>
          <div className="py-1">
            <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              Organization
            </DropdownMenuItem>
            <DropdownMenuItem>
              Keyboard shortcuts
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator />
          <div className="py-1">
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-400/80 hover:text-red-300 focus:text-red-300"
            >
              Sign out
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
