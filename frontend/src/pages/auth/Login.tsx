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
import { cn } from '@/lib/utils'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

const features = [
  { stat: '12,400+', label: 'AI campaigns generated' },
  { stat: '340%', label: 'Average ROI improvement' },
  { stat: '180+', label: 'Hours saved per month' },
  { stat: '89K+', label: 'Leads captured total' },
]

const testimonial = {
  quote: "VSP AI Marketing OS cut our campaign creation time from 3 weeks to 4 hours. The AI Command Center alone pays for itself.",
  author: "Rajesh Mehta",
  role: "CMO, TechCorp India",
}

export function Login() {
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 900))
    login(
      { id: '1', name: 'Sarah Mitchell', email: data.email, role: 'Admin', organization: 'VSP Law Associates' },
      'mock-jwt-token'
    )
    navigate('/dashboard')
  }

  const handleDemo = () => {
    login(
      { id: '1', name: 'Sarah Mitchell', email: 'sarah@vsplawassociates.com', role: 'Admin', organization: 'VSP Law Associates' },
      'mock-jwt-demo'
    )
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#080810] flex overflow-hidden">
      {/* Left panel — marketing */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-[100px]" />
          <div className="bg-grid-pattern absolute inset-0 opacity-100" />
        </div>

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.5)]">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">VSP AI Marketing OS</p>
              <p className="text-[10px] text-indigo-400/80 leading-tight">Your AI Marketing Team</p>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                <span className="text-xs text-indigo-300 font-medium">Enterprise AI Platform</span>
              </div>

              <h1 className="text-[42px] font-bold text-white leading-[1.08] tracking-tight mb-5">
                The future of<br />
                <span className="gradient-text">AI Marketing</span><br />
                is here.
              </h1>

              <p className="text-white/45 text-lg leading-relaxed mb-10">
                Generate complete campaigns, content, videos, and insights — powered by AI. One platform for your entire marketing operation.
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-2 gap-3 mb-10"
            >
              {features.map((f) => (
                <div
                  key={f.label}
                  className={cn(
                    'p-4 rounded-2xl',
                    'bg-white/[0.03] border border-white/[0.07]',
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
                  )}
                >
                  <p className="text-2xl font-bold text-white tabular-nums">{f.stat}</p>
                  <p className="text-xs text-white/40 mt-1 font-medium">{f.label}</p>
                </div>
              ))}
            </motion.div>

            {/* Testimonial */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className={cn(
                'p-5 rounded-2xl',
                'bg-white/[0.025] border border-white/[0.06]',
              )}
            >
              <p className="text-sm text-white/55 italic leading-relaxed mb-3">
                "{testimonial.quote}"
              </p>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/40 to-violet-500/40 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                  {testimonial.author.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/70">{testimonial.author}</p>
                  <p className="text-[10px] text-white/35">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Bottom logos */}
          <div className="flex items-center gap-2 flex-wrap">
            {['VSP Law', 'TechCorp India', 'NRI Ventures', 'Mehta Capital', '+38 more'].map((c) => (
              <div
                key={c}
                className="px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-[11px] text-white/30 font-medium"
              >
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 lg:max-w-[440px] items-center justify-center p-8 bg-[#070710] lg:border-l lg:border-white/[0.06]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[360px]"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">VSP AI Marketing OS</p>
              <p className="text-[10px] text-indigo-400/80">Your AI Marketing Team</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
            <p className="text-sm text-white/40 mt-1.5">Sign in to your workspace</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50 tracking-wide">Email address</label>
              <Input
                type="email"
                placeholder="sarah@company.com"
                autoComplete="email"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-400/90 flex items-center gap-1 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/50 tracking-wide">Password</label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400/90 mt-1">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 mt-2"
              variant="gradient"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-[#070710] text-[11px] text-white/25 font-medium">or</span>
            </div>
          </div>

          {/* Demo CTA */}
          <Button
            variant="outline"
            size="lg"
            className="w-full h-11"
            onClick={handleDemo}
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Try Demo — No signup required
          </Button>

          {/* Footer */}
          <p className="text-center text-[11px] text-white/25 mt-8 leading-relaxed">
            By signing in, you agree to our{' '}
            <a href="#" className="text-indigo-400/80 hover:text-indigo-400 transition-colors">Terms of Service</a>
            {' '}and{' '}
            <a href="#" className="text-indigo-400/80 hover:text-indigo-400 transition-colors">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
