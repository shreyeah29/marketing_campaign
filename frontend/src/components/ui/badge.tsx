import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors select-none',
  {
    variants: {
      variant: {
        default: [
          'bg-indigo-500/15 text-indigo-300',
          'border border-indigo-500/25',
          'shadow-[inset_0_1px_0_rgba(99,102,241,0.1)]',
        ].join(' '),
        secondary: [
          'bg-white/[0.07] text-white/55',
          'border border-white/[0.08]',
        ].join(' '),
        destructive: [
          'bg-red-500/15 text-red-300',
          'border border-red-500/25',
        ].join(' '),
        success: [
          'bg-emerald-500/15 text-emerald-300',
          'border border-emerald-500/25',
          'shadow-[inset_0_1px_0_rgba(16,185,129,0.08)]',
        ].join(' '),
        warning: [
          'bg-amber-500/15 text-amber-300',
          'border border-amber-500/25',
        ].join(' '),
        outline: 'border border-white/[0.12] text-white/50',
        violet: [
          'bg-violet-500/15 text-violet-300',
          'border border-violet-500/25',
        ].join(' '),
        cyan: [
          'bg-cyan-500/15 text-cyan-300',
          'border border-cyan-500/25',
        ].join(' '),
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
