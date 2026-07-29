import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth'

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormData = z.infer<typeof schema>

export function Login() {
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (_data: FormData) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1000))
    login(
      { id: '1', name: 'Sarah Mitchell', email: _data.email, role: 'Admin', organization: 'VSP Law Associates' },
      'mock-jwt-token'
    )
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-gradient-to-br from-zinc-950 via-indigo-950/30 to-zinc-950 border-r border-white/6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white">VSP AI Marketing OS</p>
            <p className="text-xs text-indigo-400">Your AI Marketing Team in One Platform</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold text-white leading-tight"
            >
              The future of<br />
              <span className="gradient-text">AI Marketing</span><br />
              is here.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-4 text-white/50 text-lg leading-relaxed"
            >
              Generate campaigns, content, videos, and insights — all with AI. Manage your entire marketing operation from one beautiful platform.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-4"
          >
            {[
              { label: 'Campaigns generated', value: '12,400+' },
              { label: 'Leads captured', value: '89,000+' },
              { label: 'ROI improvement', value: '340%' },
              { label: 'Hours saved/month', value: '180+' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-xl bg-white/4 border border-white/8">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-white/40 mt-1">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="flex items-center gap-4">
          {['VSP Law', 'TechCorp India', 'NRI Ventures', '+40 more'].map((c) => (
            <div key={c} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/8 text-xs text-white/40">{c}</div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-[480px] flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-8"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white">VSP AI Marketing OS</p>
              <p className="text-xs text-indigo-400">Your AI Marketing Team in One Platform</p>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-white/40 mt-1 text-sm">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-white/60 font-medium">Email address</label>
              <Input
                type="email"
                placeholder="sarah@company.com"
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-white/60 font-medium">Password</label>
                <Link to="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <Button type="submit" size="lg" className="w-full" variant="gradient" disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/8" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-zinc-950 text-white/30">Or continue with demo</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => {
              login(
                { id: '1', name: 'Sarah Mitchell', email: 'sarah@vsplawassociates.com', role: 'Admin', organization: 'VSP Law Associates' },
                'mock-jwt-demo'
              )
              navigate('/dashboard')
            }}
          >
            <Sparkles className="w-4 h-4 mr-2 text-indigo-400" />
            Try Demo Account
          </Button>

          <p className="text-center text-xs text-white/30">
            By signing in, you agree to our{' '}
            <a href="#" className="text-indigo-400 hover:underline">Terms</a> and{' '}
            <a href="#" className="text-indigo-400 hover:underline">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
