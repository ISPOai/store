// Upstream is a Vite app: `import.meta.env.DEV` gates the entire authoring
// surface (create/rename/delete slides, folder drag-and-drop, the inspector,
// the style panel), and `import.meta.env.PROD` hides it. The dev server IS the
// product there — the production build is a viewer.
//
// This host builds with esbuild in ESM mode with code splitting, so
// `import.meta` is per-chunk and cannot be patched once from the entry. The
// vendored sources therefore read these globals instead (a mechanical rewrite
// of `import.meta.env` → `__OSD_ENV__`, `import.meta.hot` → `__OSD_HOT__`;
// see UPSTREAM.md). This module is imported first by the entry so the values
// exist before any vendored module body runs.
//
// DEV is true because the authoring app is the app we are porting.

export type OsdEnv = {
  DEV: boolean
  PROD: boolean
  MODE: string
  BASE_URL: string
  SSR: boolean
}

const env: OsdEnv = {
  DEV: true,
  PROD: false,
  MODE: 'development',
  // Routing is hash-based in the iframe, so every asset path stays at the root.
  BASE_URL: '/',
  SSR: false,
}

declare global {
  // eslint-disable-next-line no-var
  var __OSD_ENV__: OsdEnv
  // Vite's HMR handle. There is no HMR here; every read is optional-chained
  // upstream, so `undefined` is the correct value rather than a fake object.
  // eslint-disable-next-line no-var
  var __OSD_HOT__: undefined
}

globalThis.__OSD_ENV__ = env
globalThis.__OSD_HOT__ = undefined

export default env
