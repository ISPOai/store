// App-level engine singletons: the session asset library and registered
// fonts. Both the live editor session and the headless command paths
// (export-video, render-preview) resolve media and text through these same
// instances, so a command renders with exactly what the editor would.
import type { FontSource } from '@diffusionstudio/runtime'
import type { AssetLibrary } from '@diffusionstudio/assets'
import { createSessionLibrary, type UrlFetcher } from './session-library.ts'

/** Fetches one controlled media reference as a File on the host origin. */
export const fetchMediaReference: UrlFetcher = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`the media reference is not readable (${response.status})`)
  const blob = await response.blob()
  const name = url.split('/').at(-1)?.split('?')[0] ?? 'media'
  return new File([blob], name, { type: blob.type || 'application/octet-stream' })
}

const library: AssetLibrary = createSessionLibrary(fetchMediaReference)
const fonts: FontSource[] = []

export function sessionAssetLibrary(): AssetLibrary {
  return library
}

export function sessionFontSources(): readonly FontSource[] {
  return fonts
}

export function registerSessionFont(source: FontSource): void {
  fonts.push(source)
}

/**
 * Appends `sources` to a world's font list without duplicating entries the
 * list already holds: remounts (undo/redo restores, export capture worlds)
 * re-attach the same session sources, and the engine's font registry can
 * survive across worlds, so a plain push would grow on every remount.
 */
export function appendFontSources(list: FontSource[], sources: readonly FontSource[]): void {
  for (const source of sources) {
    if (!list.includes(source)) list.push(source)
  }
}
