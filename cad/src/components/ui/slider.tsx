"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex h-[20px] w-full touch-none items-center select-none data-[disabled]:opacity-[0.52] data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "relative h-[18px] grow overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--foreground)_5%,transparent)] bg-[color-mix(in_srgb,var(--background)_92%,var(--card))] shadow-[var(--w-inset-bezel)] data-[orientation=vertical]:h-full data-[orientation=vertical]:w-[18px]"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute h-full bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] data-[orientation=vertical]:h-auto data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block size-4 shrink-0 cursor-grab rounded-full border border-[color-mix(in_srgb,var(--foreground)_5%,transparent)] bg-[linear-gradient(to_bottom,var(--card),color-mix(in_srgb,var(--foreground)_3%,var(--card)))] shadow-[inset_0_1px_0_color-mix(in_srgb,#fff_70%,transparent),0_1px_3px_rgba(0,0,0,0.28)] transition-[width,height] duration-[80ms] ease-[cubic-bezier(0.2,0,0,1)] outline-none active:size-5 active:cursor-grabbing disabled:pointer-events-none dark:bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--foreground)_11%,var(--card)),color-mix(in_srgb,var(--foreground)_6%,var(--card)))] dark:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_9%,transparent),0_1px_3px_rgba(0,0,0,0.28)]"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
