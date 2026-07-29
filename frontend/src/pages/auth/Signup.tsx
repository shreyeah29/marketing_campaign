import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sparkles, ArrowRight, Loader2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/services/api'

const schema = z.object({
  name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationName: z.string().min(2, 'Enter your company / organization name'),
  industry: z.string().optional(),
  website: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function Signup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
        organizationName: data.organizationName,
        industry: data.industry,
        website: data.website,
      })
      login(
        {
          id: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          organization: res.user.organization,
          organizationId: res.user.organizationId,
        },
        res.token
      )
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-indigo-600/[0.07] rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-[440px]"
      >
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.45)]">
            <Sparkles className="w-[18px] h-[18px] text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">VSP AI Marketing OS</p>
            <p className="text-[10px] text-indigo-400/80">Create your workspace</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-7 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <div className="mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/[0.12] border border-indigo-500/20 flex items-center justify-center mb-3">
              <Building2 className="w-5 h-5 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Create account</h1>
            <p className="text-sm text-white/40 mt-1.5">Start your AI marketing workspace in under a minute.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50">Full name</label>
              <Input placeholder="Sarah Mitchell" {...register('name')} />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50">Work email</label>
              <Input type="email" placeholder="you@company.com" {...register('email')} />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50">Password</label>
              <Input type="password" placeholder="••••••••" {...register('password')} />
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50">Organization / Company</label>
              <Input placeholder="Acme Marketing Inc" {...register('organizationName')} />
              {errors.organizationName && <p className="text-xs text-red-400">{errors.organizationName.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/50">Industry</label>
                <Input placeholder="Legal / SaaS / ..." {...register('industry')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/50">Website</label>
                <Input placeholder="https://" {...register('website')} />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <Button type="submit" variant="gradient" size="lg" className="w-full h-11 mt-1" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create workspace <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </form>

          <p className="text-center text-xs text-white/35 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
