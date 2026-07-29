import { api } from '@/lib/api'

// ── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: { id: string; name: string; email: string; role: string; organization: string } }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password }, auth: false }
    ),
  forgotPassword: (email: string) =>
    api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
}

// ── AI ──────────────────────────────────────────────────────────────────────
export const aiApi = {
  generateCampaign: (prompt: string, organizationId?: string) =>
    api<{ summary: string; sections: Array<{ id: string; title: string; type: string; content: string }> }>(
      '/api/ai/campaign',
      { method: 'POST', body: { prompt, organizationId: organizationId || '00000000-0000-0000-0000-000000000001' } }
    ),
  generateContent: (type: string, brief: string) =>
    api<{ content: string; type: string }>('/api/ai/content', { method: 'POST', body: { type, brief } }),
  insights: () =>
    api<Array<{ text: string; priority: string }>>('/api/ai/insights'),
  saveCampaign: (payload: { name?: string; summary?: string; sections?: unknown }) =>
    api<{ id: string; message: string }>('/api/ai/campaign/save', { method: 'POST', body: payload }),
}

// ── Analytics / Dashboard ───────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: () => api<{
    kpis: Record<string, number>
    revenueByMonth: Array<{ month: string; revenue: number; leads: number; target: number }>
    funnel: Array<{ name: string; value: number }>
    activity: Array<Record<string, unknown>>
    tasks: Array<Record<string, unknown>>
  }>('/api/analytics/dashboard'),
  channels: () => api<Array<Record<string, unknown>>>('/api/analytics/channels'),
  recommendations: () => api<Array<{ text: string; impact: string; effort: string }>>('/api/analytics/recommendations'),
  activity: () => api<Array<Record<string, unknown>>>('/api/analytics/activity'),
  tasks: () => api<Array<Record<string, unknown>>>('/api/analytics/tasks'),
  createTask: (task: string, due?: string, priority?: string) =>
    api('/api/analytics/tasks', { method: 'POST', body: { task, due, priority } }),
}

// ── Campaigns ───────────────────────────────────────────────────────────────
export const campaignsApi = {
  list: (search?: string, status?: string) =>
    api<Array<Record<string, unknown>>>('/api/campaigns', { query: { search, status } }),
  create: (body: { name: string; channel: string; budget: number }) =>
    api('/api/campaigns', { method: 'POST', body }),
  updateStatus: (id: string, status: string) =>
    api(`/api/campaigns/${id}/status`, { method: 'PUT', body: { status } }),
}

// ── Leads / CRM ─────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (params?: { search?: string; status?: string; page?: number }) =>
    api<{ data: Array<Record<string, unknown>>; total: number }>('/api/leads', { query: params }),
  pipeline: () => api<{ stages: Array<Record<string, unknown>>; stats: Record<string, unknown> }>('/api/leads/pipeline'),
  create: (body: { name: string; email: string; phone?: string; company?: string; source?: string }) =>
    api('/api/leads', { method: 'POST', body }),
  updateStatus: (id: string, status: string) =>
    api(`/api/leads/${id}/status`, { method: 'PUT', body: { status } }),
}

// ── Content ─────────────────────────────────────────────────────────────────
export const contentApi = {
  drafts: () => api<Array<Record<string, unknown>>>('/api/content/drafts'),
  generate: (type: string, brief: string) =>
    api<{ content: string }>('/api/content/generate', { method: 'POST', body: { type, brief } }),
  saveDraft: (title: string, type: string, content: string) =>
    api('/api/content/drafts', { method: 'POST', body: { title, type, content } }),
}

// ── Images ──────────────────────────────────────────────────────────────────
export const imagesApi = {
  list: () => api<Array<Record<string, unknown>>>('/api/images'),
  generate: (type: string, prompt: string) =>
    api<Record<string, unknown>>('/api/images/generate', { method: 'POST', body: { type, prompt } }),
  like: (id: string) => api(`/api/images/${id}/like`, { method: 'PUT' }),
}

// ── Videos ──────────────────────────────────────────────────────────────────
export const videosApi = {
  list: () => api<Array<Record<string, unknown>>>('/api/videos'),
  generate: (type: string, brief: string) =>
    api<Record<string, unknown>>('/api/videos/generate', { method: 'POST', body: { type, brief } }),
}

// ── Social ──────────────────────────────────────────────────────────────────
export const socialApi = {
  posts: (status?: string) => api<Array<Record<string, unknown>>>('/api/social/posts', { query: { status } }),
  create: (platform: string, content: string, publishNow = false) =>
    api('/api/social/posts', { method: 'POST', body: { platform, content, publishNow } }),
  schedule: (platform: string, content: string, scheduledAt: string) =>
    api('/api/social/posts/schedule', { method: 'POST', body: { platform, content, scheduledAt } }),
  analytics: () => api<Record<string, unknown>>('/api/social/analytics'),
}

// ── Email ───────────────────────────────────────────────────────────────────
export const emailApi = {
  campaigns: () => api<Array<Record<string, unknown>>>('/api/email/campaigns'),
  sequences: () => api<Array<Record<string, unknown>>>('/api/email/sequences'),
  stats: () => api<Record<string, number>>('/api/email/stats'),
  create: (name: string, subject?: string) =>
    api('/api/email/campaigns', { method: 'POST', body: { name, subject } }),
  updateStatus: (id: string, status: string) =>
    api(`/api/email/campaigns/${id}/status`, { method: 'PUT', body: { status } }),
}

// ── WhatsApp ────────────────────────────────────────────────────────────────
export const whatsappApi = {
  conversations: () => api<Array<Record<string, unknown>>>('/api/whatsapp/conversations'),
  conversation: (id: string) => api<Record<string, unknown>>(`/api/whatsapp/conversations/${id}`),
  send: (payload: { conversationId?: string; phone?: string; text: string }) =>
    api('/api/whatsapp/messages', { method: 'POST', body: payload }),
  broadcast: (message: string, recipients?: number) =>
    api('/api/whatsapp/broadcast', { method: 'POST', body: { message, recipients } }),
}

// ── Voice ───────────────────────────────────────────────────────────────────
export const voiceApi = {
  calls: () => api<Array<Record<string, unknown>>>('/api/voice/calls'),
  call: (id: string) => api<Record<string, unknown>>(`/api/voice/calls/${id}`),
  initiate: (phone: string, name?: string) =>
    api('/api/voice/calls', { method: 'POST', body: { phone, name } }),
}

// ── Automation ──────────────────────────────────────────────────────────────
export const automationApi = {
  workflows: () => api<Array<Record<string, unknown>>>('/api/automation/workflows'),
  executions: () => api<Array<Record<string, unknown>>>('/api/automation/executions'),
  create: (name: string, steps?: string[]) =>
    api('/api/automation/workflows', { method: 'POST', body: { name, steps } }),
  updateStatus: (id: string, status: string) =>
    api(`/api/automation/workflows/${id}/status`, { method: 'PUT', body: { status } }),
}

// ── Templates ───────────────────────────────────────────────────────────────
export const templatesApi = {
  list: (search?: string, category?: string) =>
    api<Array<Record<string, unknown>>>('/api/templates', { query: { search, category } }),
  create: (name: string, category?: string) =>
    api('/api/templates', { method: 'POST', body: { name, category } }),
  use: (id: string) => api(`/api/templates/${id}/use`, { method: 'POST' }),
}

// ── Settings ────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api<Record<string, unknown>>('/api/settings'),
  updateOrganization: (body: Record<string, unknown>) =>
    api('/api/settings/organization', { method: 'PUT', body }),
  updateBrand: (body: Record<string, unknown>) =>
    api('/api/settings/brand', { method: 'PUT', body }),
  updateApiKeys: (body: Record<string, unknown>) =>
    api('/api/settings/api-keys', { method: 'PUT', body }),
  billing: () => api<Record<string, unknown>>('/api/settings/billing'),
}
