import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Sparkles, Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z.object({ email: z.string().email('Enter a valid email address') })
type FormData = z.infer<typeof schema>

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1000))
    setSentEmail(data.email)
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#080810] flex items-center justify-center p-6">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-600/[0.06] rounded-full blur-[100px]" />
        <div className="bg-grid-pattern absolute inset-0" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[380px]"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.45)]">
              <Sparkles className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">VSP AI Marketing OS</p>
              <p className="text-[10px] text-indigo-400/80">Your AI Marketing Team</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white/[0.025] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
          <AnimatePresence mode="wait">
            {!sent ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="p-7"
              >
                <div className="mb-6">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-500/[0.12] border border-indigo-500/20 flex items-center justify-center mb-4">
                    <Mail className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Reset password</h2>
                  <p className="text-sm text-white/40 mt-1.5 leading-relaxed">
                    Enter your email and we'll send a reset link to your inbox.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white/50 tracking-wide">
                      Email address
                    </label>
                    <Input
                      type="email"
                      placeholder="sarah@company.com"
                      autoComplete="email"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-xs text-red-400/90 mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    variant="gradient"
                    className="w-full h-11"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : 'Send reset link'}
                  </Button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="p-7 text-center"
              >
                <div className="flex justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/[0.12] border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Check your inbox</h2>
                <p className="text-sm text-white/40 mt-2 leading-relaxed">
                  We've sent a password reset link to{' '}
                  <span className="text-white/65 font-semibold">{sentEmail}</span>
                </p>
                <p className="text-[11px] text-white/25 mt-4">
                  Didn't receive it? Check spam or{' '}
                  <button
                    onClick={() => setSent(false)}
                    className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    try again
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Back to login */}
        <div className="flex justify-center mt-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-white/65 font-medium transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
