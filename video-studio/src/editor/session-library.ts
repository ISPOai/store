// The session asset library: the vendored engine's AssetLibrary over an
// empty project FS, so media resolves through URL-backed transient handles
// on the host origin. This app has no filesystem — every FS method answers
// "nothing here" and the library's native URL resolution does the rest.
import { AssetLibrary, type AssetStat, type ProjectFS } from '@diffusionstudio/assets'
import { isControlledMediaUrl } from '../domain/media-assets.ts'

export type UrlFetcher = (url: string) => Promise<File>

export function createSessionLibrary(fetchFile: UrlFetcher): AssetLibrary {
  const controlledReferenceStat: AssetStat = { size: 0, mtime: 0 }
  const emptyFs: ProjectFS = {
    readManifest: () => Promise.resolve(null),
    writeManifest: () => Promise.resolve(),
    list: () => Promise.resolve([]),
    // Diffusion Studio classifies only HTTP(S) strings as URL sources. Tell its
    // project-source seam that host-controlled references exist so resolution
    // reaches `file()` below, where the injected fetcher reads the actual bytes.
    // The placeholder stat is only an existence gate; the library replaces it
    // with the fetched File's real size and mtime when it describes the asset.
    stat: (source: string) => Promise.resolve(
      isControlledMediaUrl(source) ? controlledReferenceStat : null,
    ),
    file: (source: string) => fetchFile(source),
    write: () => Promise.reject(new Error('this app does not write asset files')),
    remove: () => Promise.resolve(),
  }
  return new AssetLibrary(emptyFs)
}

/**
 * Resolves a controlled URL through the session library to learn what the
 * engine will decode (dimensions for placement). One probe per URL; the
 * resulting transient asset is what engine-side `src` resolution reuses.
 */
export async function probeMedia(
  library: AssetLibrary,
  url: string,
): Promise<{ width: number | null; height: number | null }> {
  const asset = await library.resolve(url)
  if (asset.type === 'VIDEO' || asset.type === 'IMAGE' || asset.type === 'SEQUENCE') {
    return { width: asset.width, height: asset.height }
  }
  return { width: null, height: null }
}
