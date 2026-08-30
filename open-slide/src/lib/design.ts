// Ported from open-slide (`packages/core/src/app/lib/design.ts`, MIT, © 2026
// Yiwei Ho). A deck's whole look is four values, projected onto CSS custom
// properties so a page can style itself with `var(--osd-*)` and inherit the
// deck's identity without importing anything.

export type DesignSystem = {
  palette: { bg: string; text: string; accent: string }
  fonts: { display: string; body: string }
  typeScale: { hero: number; body: number }
  radius: number
}

export function designToCssVars(d: DesignSystem): Record<string, string> {
  return {
    '--osd-bg': d.palette.bg,
    '--osd-text': d.palette.text,
    '--osd-accent': d.palette.accent,
    '--osd-font-display': d.fonts.display,
    '--osd-font-body': d.fonts.body,
    '--osd-size-hero': `${d.typeScale.hero}px`,
    '--osd-size-body': `${d.typeScale.body}px`,
    '--osd-radius': `${d.radius}px`,
  }
}

export const defaultDesign: DesignSystem = {
  palette: {
    bg: '#f7f5f0',
    text: '#1a1814',
    accent: '#6d4cff',
  },
  fonts: {
    display: 'Georgia, "Times New Roman", serif',
    body: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
  },
  typeScale: {
    hero: 168,
    body: 36,
  },
  radius: 12,
}

// A second built-in so a new deck can pick a mood without inventing hex codes.
// Same shape, so anything that renders `defaultDesign` renders this too.
export const midnightDesign: DesignSystem = {
  palette: {
    bg: '#0a0e14',
    text: '#e6edf3',
    accent: '#6ee7ff',
  },
  fonts: {
    display: "'JetBrains Mono', Menlo, Consolas, monospace",
    body: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  },
  typeScale: {
    hero: 132,
    body: 34,
  },
  radius: 6,
}

export const DESIGN_PRESETS = { default: defaultDesign, midnight: midnightDesign } as const

export type DesignPresetName = keyof typeof DESIGN_PRESETS
