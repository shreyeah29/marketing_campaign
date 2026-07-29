import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/auth/Login'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { AICommandCenter } from '@/pages/ai-command/AICommandCenter'
import { ContentStudio } from '@/pages/content/ContentStudio'
import { ImageStudio } from '@/pages/image/ImageStudio'
import { VideoStudio } from '@/pages/video/VideoStudio'
import { SocialMedia } from '@/pages/social/SocialMedia'
import { EmailMarketing } from '@/pages/email/EmailMarketing'
import { WhatsApp } from '@/pages/whatsapp/WhatsApp'
import { VoiceAI } from '@/pages/voice/VoiceAI'
import { CRM } from '@/pages/crm/CRM'
import { Automation } from '@/pages/automation/Automation'
import { Analytics } from '@/pages/analytics/Analytics'
import { Templates } from '@/pages/templates/Templates'
import { Settings } from '@/pages/settings/Settings'
import { Campaigns } from '@/pages/campaigns/Campaigns'
import { useAuthStore } from '@/store/auth'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="ai-command" element={<AICommandCenter />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="content" element={<ContentStudio />} />
            <Route path="image" element={<ImageStudio />} />
            <Route path="video" element={<VideoStudio />} />
            <Route path="social" element={<SocialMedia />} />
            <Route path="email" element={<EmailMarketing />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="voice" element={<VoiceAI />} />
            <Route path="crm" element={<CRM />} />
            <Route path="automation" element={<Automation />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="templates" element={<Templates />} />
            <Route path="settings/*" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
