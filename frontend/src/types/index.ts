export interface User {
  id: string
  name: string
  email: string
  role: string
  avatar?: string
  organization: string
}

export interface KPIMetric {
  label: string
  value: string | number
  change: number
  changeLabel: string
  trend: 'up' | 'down' | 'neutral'
  icon: string
  color: string
}

export interface Campaign {
  id: string
  name: string
  status: 'active' | 'paused' | 'draft' | 'completed'
  channel: string
  budget: number
  spent: number
  leads: number
  conversions: number
  roi: number
  createdAt: string
}

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  score: number
  value: number
  source: string
  createdAt: string
}

export interface AIJob {
  id: string
  type: string
  prompt: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  createdAt: string
  completedAt?: string
}

export interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: string
}
