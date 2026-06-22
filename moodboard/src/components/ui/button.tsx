import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'default' | 'secondary' | 'ghost'
export type ButtonSize = 'default' | 'sm' | 'lg'

// Colours route through the theme-aware shadcn tokens (which flip with the host
// dark class) rather than the host's --w-* set, which is undefined here and was
// silently collapsing to its baked-in light-mode hex fallbacks in dark mode.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'bg-foreground text-background hover:opacity-90 active:opacity-80',
  secondary:
    'bg-muted text-foreground hover:bg-accent',
  ghost:
    'bg-transparent text-foreground hover:bg-muted',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-7 px-3 text-xs',
  lg: 'h-11 px-6 text-base',
}

const BASE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'default', className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      data-slot="button"
      type={type ?? 'button'}
      className={cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...rest}
    />
  )
})
