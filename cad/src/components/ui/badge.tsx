import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-[6px] min-h-[22px] w-fit shrink-0 whitespace-nowrap rounded-full border border-transparent px-2 text-xs font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] [&>svg]:size-3 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_srgb,var(--primary)_12%,var(--secondary))] text-primary",
        secondary:
          "bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)] border-border text-foreground",
        destructive:
          "bg-[color-mix(in_srgb,var(--destructive)_10%,var(--secondary))] text-destructive",
        outline:
          "bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)] border-border text-foreground",
        ghost:
          "bg-transparent text-foreground [a&]:hover:bg-secondary",
        link: "bg-transparent text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
