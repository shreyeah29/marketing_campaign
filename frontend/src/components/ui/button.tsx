import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-[0.975] active:duration-75',
    'select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-indigo-600 text-white',
          'hover:bg-indigo-500',
          'shadow-[0_1px_2px_rgba(0,0,0,0.4),0_4px_12px_rgba(99,102,241,0.3)]',
          'hover:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_6px_20px_rgba(99,102,241,0.4)]',
        ].join(' '),
        destructive: [
          'bg-red-500/90 text-white',
          'hover:bg-red-500',
          'shadow-[0_1px_2px_rgba(0,0,0,0.4),0_4px_12px_rgba(239,68,68,0.25)]',
        ].join(' '),
        outline: [
          'border border-white/[0.1] bg-white/[0.03] text-white/80',
          'hover:bg-white/[0.06] hover:border-white/[0.15] hover:text-white',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        ].join(' '),
        secondary: [
          'bg-white/[0.08] text-white/80',
          'hover:bg-white/[0.12] hover:text-white',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        ].join(' '),
        ghost: [
          'text-white/60 hover:text-white/90',
          'hover:bg-white/[0.06]',
        ].join(' '),
        link: 'text-indigo-400 underline-offset-4 hover:underline hover:text-indigo-300',
        gradient: [
          'bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 text-white',
          'hover:from-indigo-500 hover:via-indigo-400 hover:to-violet-500',
          'shadow-[0_1px_2px_rgba(0,0,0,0.4),0_6px_20px_rgba(99,102,241,0.35)]',
          'hover:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_28px_rgba(99,102,241,0.45)]',
        ].join(' '),
      },
      size: {
        default: 'h-9 px-4 py-2 gap-2',
        sm: 'h-8 rounded-lg px-3 text-xs gap-1.5',
        lg: 'h-11 rounded-xl px-6 gap-2',
        xl: 'h-12 rounded-2xl px-8 text-base gap-2.5',
        icon: 'h-9 w-9 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
