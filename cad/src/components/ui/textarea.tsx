import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex w-full min-w-0 min-h-16 px-[10px] py-2 rounded-[var(--radius)] border border-border bg-[color-mix(in_srgb,var(--foreground)_3%,var(--card))] text-[13px] leading-[1.5] text-foreground outline-none field-sizing-content resize-none transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "placeholder:text-[color-mix(in_srgb,var(--muted-foreground)_62%,transparent)] selection:bg-primary selection:text-primary-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[0.58]",
        " ",
        "aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
