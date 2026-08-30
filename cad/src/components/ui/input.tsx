import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 min-h-[34px] px-[10px] py-1 rounded-[var(--radius)] border border-border bg-[color-mix(in_srgb,var(--foreground)_3%,var(--card))] text-[13px] leading-[1.2] text-foreground outline-none transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "placeholder:text-[color-mix(in_srgb,var(--muted-foreground)_62%,transparent)] selection:bg-primary selection:text-primary-foreground",
        "file:text-[13px] file:font-medium file:border-0 file:bg-transparent file:text-foreground file:inline-flex file:h-6",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.58]",
        " ",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
