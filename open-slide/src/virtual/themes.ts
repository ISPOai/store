// Replaces `virtual:open-slide/themes`. A theme is `themes/<id>.md` (front
// matter + prose) with an optional `themes/<id>.demo.tsx` deck, exactly as
// upstream lays them out; the demo compiles through the same runtime seam a
// slide does.

import type { DesignSystem } from '@/lib/design'
import type { Page } from '@/lib/sdk'
import { compileSlideModule } from '../runtime/slide-module'
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

export async function loadThemeDemo(id: string): Promise<{ default: Page[]; design?: DesignSystem }> {
  const path = `${THEMES_DIR}/${id}.demo.tsx`
  const source = await readText(path)
  if (source === null) throw new Error(`Theme demo not found: ${id}`)
  const compiled = compileSlideModule(source, path)
  if (!Array.isArray(compiled.default)) {
    throw new Error(`Theme demo ${id} must default-export an array of page components`)
  }
  return compiled as unknown as { default: Page[]; design?: DesignSystem }
}
