import { Bell, Search, ChevronDown, Command } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="h-16 border-b border-white/6 flex items-center px-6 gap-4 shrink-0 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-20">
      <div className="flex-1">
        <h1 className="font-semibold text-white text-[15px]">{title}</h1>
        {subtitle && <p className="text-xs text-white/40">{subtitle}</p>}
      </div>

      {/* Search trigger */}
      <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-white/30 hover:text-white/60 text-sm transition-colors">
        <Search className="w-3.5 h-3.5" />
        <span>Search...</span>
        <div className="ml-8 flex items-center gap-0.5 text-[10px] bg-white/8 rounded px-1 py-0.5">
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-4 h-4 text-white/60" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notifications</span>
            <Badge variant="default" className="text-[10px]">4 new</Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {[
            { title: 'Campaign live', desc: 'NRI Dallas campaign started successfully', time: '2m ago', color: 'bg-emerald-500' },
            { title: 'Lead alert', desc: 'Rahul Sharma submitted the consultation form', time: '15m ago', color: 'bg-indigo-500' },
            { title: 'AI job complete', desc: 'Video script generation finished', time: '1h ago', color: 'bg-violet-500' },
            { title: 'Budget alert', desc: 'Facebook ad spend at 85% of budget', time: '3h ago', color: 'bg-amber-500' },
          ].map((n, i) => (
            <DropdownMenuItem key={i} className="flex-col items-start gap-1 py-3">
              <div className="flex items-center gap-2 w-full">
                <div className={`w-2 h-2 rounded-full ${n.color} shrink-0`} />
                <span className="font-medium text-white text-xs">{n.title}</span>
                <span className="ml-auto text-[10px] text-white/30">{n.time}</span>
              </div>
              <p className="text-[11px] text-white/50 pl-4">{n.desc}</p>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 hover:bg-white/5 rounded-lg px-2 py-1.5 transition-colors">
            <Avatar className="w-7 h-7">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-xs">{user?.name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left">
              <p className="text-xs font-medium text-white/80 leading-tight">{user?.name || 'User'}</p>
              <p className="text-[10px] text-white/40 leading-tight">{user?.role || 'Admin'}</p>
            </div>
            <ChevronDown className="w-3 h-3 text-white/40" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/settings/profile')}>Profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/settings')}>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-300">
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
