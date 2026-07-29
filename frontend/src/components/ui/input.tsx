import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl',
          'border border-white/[0.09] bg-white/[0.04]',
          'px-3.5 py-2 text-sm text-white',
          'placeholder:text-white/25',
          'shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_0_1px_rgba(255,255,255,0.02)]',
          'transition-all duration-200 ease-out',
          'hover:border-white/[0.14] hover:bg-white/[0.055]',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60',
          'focus:bg-white/[0.05]',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
