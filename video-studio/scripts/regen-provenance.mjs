#!/usr/bin/env node
// Regenerates PROVENANCE.json inside this app folder. Not part of the app
// bundle; run from the Store repository root after vendoring or editing any
// file under vendor/diffusionstudio.
//
//   node video-studio/scripts/regen-provenance.mjs <path-to-upstream-clone>
//
// The pinned upstream commit is fixed below; the clone must be checked out
// at exactly that commit (the script verifies it).
import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const UPSTREAM_COMMIT = 'aeb873bfc6c239a05821c9af307fca34a06e8928'
const UPSTREAM_REPO = 'https://github.com/diffusionstudio/editor'
const APP_ROOT = path.resolve(import.meta.dirname, '..')
const VENDOR_ROOT = path.join(APP_ROOT, 'vendor', 'diffusionstudio')

const PACKAGES = ['assets', 'encoder', 'jsx', 'reconciler', 'runtime']

async function isFile(target) {
  try {
    return (await stat(target)).isFile()
  } catch {
    return false
  }
}

async function listFiles(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listFiles(full)))
    else out.push(full)
  }
  return out.sort()
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

async function gitHead(clone) {
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', clone, 'rev-parse', 'HEAD'], (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.trim())
    })
  })
}

const clone = process.argv[2]
if (!clone) {
  console.error('usage: regen-provenance.mjs <path-to-upstream-clone>')
  process.exit(1)
}
const head = await gitHead(clone)
if (head !== UPSTREAM_COMMIT) {
  console.error(`upstream clone is at ${head}, expected ${UPSTREAM_COMMIT}`)
  process.exit(1)
}

const files = []
for (const name of PACKAGES) {
  const vendoredPkg = path.join(VENDOR_ROOT, name)
  const upstreamPkg = path.join(clone, 'packages', name)
  for (const file of await listFiles(vendoredPkg)) {
    const relVendor = path.relative(VENDOR_ROOT, file)
    const digest = await sha256(file)
    const upstreamFile = path.join(upstreamPkg, path.relative(path.join(VENDOR_ROOT, name), file))
    const upstreamDigest = (await isFile(upstreamFile)) ? await sha256(upstreamFile) : null
    files.push({
      path: `vendor/diffusionstudio/${relVendor}`,
      sha256: digest,
      upstreamPath: upstreamDigest ? path.relative(clone, upstreamFile) : null,
      upstreamSha256: upstreamDigest,
      relation: upstreamDigest === digest ? 'unmodified' : upstreamDigest ? 'adapted' : 'added',
    })
  }
}

const manifest = {
  schemaVersion: 1,
  app: '@ispo-store/video-studio',
  upstream: {
    repository: UPSTREAM_REPO,
    commit: UPSTREAM_COMMIT,
    version: '0.200.0',
    revisionDate: '2026-08-27',
    license: 'MPL-2.0',
  },
  license: {
    vendoredCode: 'MPL-2.0',
    notice: 'MPL notices preserved in every vendored file; full text in LICENSE-MPL-2.0.txt',
    fonts: [{ file: 'assets/fonts/inter-variable.ttf', license: 'SIL-OFL-1.1' }],
  },
  excluded: [
    'apps/desktop (Electron shell, updater, deep links, brand assets)',
    'apps/cli (dapi Unix-socket CLI)',
    'apps/web (hosted-service editor UI: auth, Supabase, billing, generation, telemetry)',
    'packages/koota-solid (unused by this adaptation)',
    'node_modules, dist, lockfiles from upstream',
  ],
  files,
}

// vendor/koota is a separately maintained vendored package (registry tarball
// upstream, ISC): this script does not regenerate it, so an existing section
// is carried forward verbatim instead of being dropped on regen.
try {
  const existing = JSON.parse(await readFile(path.join(APP_ROOT, 'PROVENANCE.json'), 'utf8'))
  if (existing.vendoredPackages !== undefined) {
    manifest.vendoredPackages = existing.vendoredPackages
  }
} catch {
  // No PROVENANCE.json yet (first vendoring) — nothing to carry forward.
}

await writeFile(
  path.join(APP_ROOT, 'PROVENANCE.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
const counts = files.reduce((acc, file) => {
  acc[file.relation] = (acc[file.relation] ?? 0) + 1
  return acc
}, {})
console.log(`PROVENANCE.json: ${files.length} files`, counts)
