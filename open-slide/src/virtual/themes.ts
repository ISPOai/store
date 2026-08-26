// Replaces `virtual:open-slide/themes`. A theme is `themes/<id>.md` (front
// matter + prose) with an optional `themes/<id>.demo.tsx` deck, exactly as
// upstream lays them out; the demo compiles through the same runtime seam a
// slide does.

import type { DesignSystem } from '@/lib/design'
import type { Page } from '@/lib/sdk'
import { listDir, readText, THEMES_DIR } from '../runtime/store'

export type ThemeMeta = {
  id: string
  name: string
  description: string
  body: string
  hasDemo: boolean
}

export let themes: ThemeMeta[] = []

/** Front matter is `---\nkey: value\n---`; anything else is body prose. */
function parseTheme(id: string, raw: string, hasDemo: boolean): ThemeMeta {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)
  const meta: Record<string, string> = {}
  let body = raw
  if (match) {
    body = match[2] ?? ''
    for (const line of (match[1] ?? '').split('\n')) {
      const at = line.indexOf(':')
      if (at === -1) continue
      meta[line.slice(0, at).trim()] = line
        .slice(at + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
  }
  return {
    id,
    name: meta.name ?? id,
    description: meta.description ?? '',
    body: body.trim(),
    hasDemo,
  }
}

export async function refreshThemes(): Promise<ThemeMeta[]> {
  const entries = await listDir(THEMES_DIR)
  const files = entries.map((entry) => entry.replace(/\/$/, ''))
  const loaded: ThemeMeta[] = []
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const id = file.slice(0, -3)
    const raw = await readText(`${THEMES_DIR}/${file}`)
    if (raw === null) continue
    loaded.push(parseTheme(id, raw, files.includes(`${id}.demo.tsx`)))
  }
  themes = loaded.sort((a, b) => a.name.localeCompare(b.name))
  return themes
}

export async function loadThemeDemo(_id: string): Promise<{ default: Page[]; design?: DesignSystem }> {
  // A theme demo is a `.tsx` deck, and this host cannot compile one at runtime
  // (see src/virtual/slides.ts). Demos would have to be compiled in like
  // slides; until they are, the gallery shows the theme without its demo
  // rather than pretending to load one.
  throw new Error('theme demos are not compiled into this build')
}
