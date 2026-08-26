// Regenerates `vendor/*.js` from the versions pinned in package.json +
// pnpm-lock.yaml.
//
// Why this exists: the host builds a project against its own runtime palette —
// React, ReactDOM and the ISPO SDK — and does NOT install an app's npm
// dependencies. A bare `import 'cmdk'` only resolves because the host's own
// node_modules leak in through esbuild's nodePaths, at whatever version the
// host happens to pin. That is invisible coupling and the versions already
// disagree with upstream's (tailwind-merge 3.5 vs 3.6, fflate 0.4 vs 0.8), so
// every dependency except the palette is bundled into this folder and mapped
// by `tsconfig.json` paths. The app then depends on nothing but itself.
//
// Run after changing a dependency:  pnpm install && pnpm vendor

import esbuild from 'esbuild'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')

// Everything the vendored app imports that the host does not provide.
// react / react-dom / react-dom/client / react/jsx-runtime / @ispo/sdk are the
// palette and must stay external so there is exactly one React in the bundle.
const PACKAGES = [
  'react-router-dom',
  'next-themes',
  'lucide-react',
  'sonner',
  'cmdk',
  '@base-ui/react',
  '@base-ui/react/button',
  '@base-ui/react/context-menu',
  '@base-ui/react/dialog',
  '@base-ui/react/menu',
  '@base-ui/react/merge-props',
  '@base-ui/react/popover',
  '@base-ui/react/progress',
  '@base-ui/react/scroll-area',
  '@base-ui/react/select',
  '@base-ui/react/separator',
  '@base-ui/react/slider',
  '@base-ui/react/tabs',
  '@base-ui/react/toggle',
  '@base-ui/react/toggle-group',
  '@base-ui/react/tooltip',
  '@base-ui/react/use-render',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  'clsx',
  'tailwind-merge',
  'class-variance-authority',
  'emoji-picker-react',
  'react-image-crop',
  'html-to-image',
  'fflate',
  'use-sync-external-store',
  'use-sync-external-store/shim',
  'sucrase',
  '@babel/parser',
  '@babel/types',
]

const EXTERNAL = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@ispo/sdk']

/** `@dnd-kit/core` → `dnd-kit__core` so every bundle is one flat file. */
function outName(pkg) {
  return `${pkg.replace(/^@/, '').replace(/\//g, '__')}.js`
}

await rm(path.join(here, 'dist'), { recursive: true, force: true })
await mkdir(path.join(here, 'dist'), { recursive: true })

const built = []
for (const pkg of PACKAGES) {
  const outfile = path.join(here, 'dist', outName(pkg))
  // A tiny re-export entry is the most faithful way to bundle a package: it
  // takes whatever the package's own exports map resolves to, rather than
  // guessing a file inside it.
  const entry = path.join(here, 'dist', `.entry-${outName(pkg)}`)
  await writeFile(entry, `export * from ${JSON.stringify(pkg)}\nexport { default } from ${JSON.stringify(pkg)}\n`)
  try {
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      mainFields: ['module', 'browser', 'main'],
      conditions: ['import', 'module', 'browser', 'default'],
      target: ['chrome130'],
      external: EXTERNAL,
      absWorkingDir: appRoot,
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
    })
    built.push(pkg)
  } catch (err) {
    // Some packages have no default export; retry without re-exporting one.
    await writeFile(entry, `export * from ${JSON.stringify(pkg)}\n`)
    try {
      await esbuild.build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'browser',
        mainFields: ['module', 'browser', 'main'],
        conditions: ['import', 'module', 'browser', 'default'],
        target: ['chrome130'],
        external: EXTERNAL,
        absWorkingDir: appRoot,
        logLevel: 'silent',
        define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
      })
      built.push(`${pkg} (no default)`)
    } catch (err2) {
      console.error(`FAILED ${pkg}:`, (err2.errors?.[0]?.text ?? err2.message))
    }
  } finally {
    await rm(entry, { force: true })
  }
}

console.log(`vendored ${built.length}/${PACKAGES.length}`)
for (const b of built) console.log('  ', b)
