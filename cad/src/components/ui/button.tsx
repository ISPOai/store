import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap min-h-[34px] px-[14px] border border-transparent rounded-[var(--radius)] font-[family-name:var(--w-font-display,ui-monospace,monospace)] text-[length:var(--w-font-display-size,12px)] font-normal tracking-[var(--w-font-display-letter-spacing,0.5px)] leading-none uppercase cursor-pointer select-none transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-[0.52] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary border-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary-foreground)_10%,var(--primary))] hover:border-[color-mix(in_srgb,var(--primary-foreground)_10%,var(--primary))]",
        destructive:
          "bg-destructive border-destructive text-white hover:bg-[color-mix(in_srgb,#fff_10%,var(--destructive))] hover:border-[color-mix(in_srgb,#fff_10%,var(--destructive))]",
        outline: "bg-card border-border text-foreground hover:bg-secondary",
        secondary:
          "bg-secondary border-transparent text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,var(--secondary))]",
        ghost: "bg-transparent border-transparent text-foreground hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline border-transparent bg-transparent min-h-0 px-0 normal-case tracking-normal font-[family-name:var(--w-font-sans,ui-sans-serif)] text-[13px]",
      },
      size: {
        default: "",
        sm: "min-h-[28px] px-[10px]",
        xs: "min-h-[24px] px-[10px] rounded-[5px]",
        lg: "min-h-[40px] px-[18px]",
        icon: "min-h-0 size-[24px] p-0 rounded-[5px] text-[color-mix(in_srgb,var(--foreground)_72%,var(--muted-foreground))] hover:text-foreground hover:bg-[var(--w-hover-wash-soft)] disabled:opacity-[0.42] [&_svg:not([class*='size-'])]:size-[14px]",
        "icon-xs":
          "min-h-0 size-[20px] p-0 rounded-[5px] text-[color-mix(in_srgb,var(--foreground)_72%,var(--muted-foreground))] hover:text-foreground hover:bg-[var(--w-hover-wash-soft)] disabled:opacity-[0.42] [&_svg:not([class*='size-'])]:size-[12px]",
        "icon-sm":
          "min-h-0 size-[28px] p-0 rounded-[5px] text-[color-mix(in_srgb,var(--foreground)_72%,var(--muted-foreground))] hover:text-foreground hover:bg-[var(--w-hover-wash-soft)] disabled:opacity-[0.42] [&_svg:not([class*='size-'])]:size-[14px]",
        "icon-lg":
          "min-h-0 size-[34px] p-0 rounded-[var(--radius)] text-[color-mix(in_srgb,var(--foreground)_72%,var(--muted-foreground))] hover:text-foreground hover:bg-[var(--w-hover-wash-soft)] disabled:opacity-[0.42] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
