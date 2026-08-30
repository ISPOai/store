"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center gap-[6px] rounded-[8px] p-[2px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default:
          "border border-[color-mix(in_srgb,var(--foreground)_5%,transparent)] bg-[color-mix(in_srgb,var(--foreground)_4%,var(--card))] dark:bg-[color-mix(in_srgb,var(--background)_86%,#000)] shadow-[inset_0_1px_0_color-mix(in_srgb,#000_3%,transparent),inset_0_-1px_0_color-mix(in_srgb,#000_3%,transparent)] dark:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_4%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--foreground)_4%,transparent)]",
        line: "gap-1 border border-transparent bg-transparent p-0 shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[23px] items-center justify-center gap-1.5 rounded-[6px] border-none bg-transparent px-[9px] whitespace-nowrap outline-none",
        "font-[family-name:var(--w-font-display,ui-monospace,monospace)] text-[length:var(--w-font-display-size,12px)] font-normal tracking-[var(--w-font-display-letter-spacing,0.5px)] leading-none uppercase",
        "text-[color-mix(in_srgb,var(--foreground)_65%,var(--muted-foreground))] dark:text-[color-mix(in_srgb,var(--foreground)_50%,var(--muted-foreground))]",
        "transition-[background-color,border-color,color] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:bg-[var(--w-hover-wash)] hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-[0.42]",
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[14px]",
        "data-[state=active]:bg-[linear-gradient(to_bottom,var(--card),color-mix(in_srgb,var(--foreground)_3%,var(--card)))] dark:data-[state=active]:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--foreground)_11%,var(--card)),color-mix(in_srgb,var(--foreground)_6%,var(--card)))] data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_70%,transparent),0_1px_2px_rgba(0,0,0,0.10)] dark:data-[state=active]:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_9%,transparent),0_1px_2px_rgba(0,0,0,0.25)]",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-none group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
