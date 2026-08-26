// The seam that replaces upstream's Vite pipeline.
//
// Upstream compiles every `slides/<id>/index.tsx` through Vite and hands the
// app a real ES module. This host builds one fixed entry with esbuild and has
// no per-content compile step, so a slide has to be compiled at runtime
// instead: read the source out of project storage, transform the TSX to plain
// JS with Sucrase, and evaluate it with `new Function`.
//
// `new Function` works inside the sandboxed project iframe; dynamic `import()`
// of a blob: or data: URL does not (the module fetch is refused), which is why
// this evaluates a function body rather than importing a synthetic module.

import { transform } from 'sucrase'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'

export type CompiledModule = Record<string, unknown> & { default?: unknown }

/** Modules a slide is allowed to import, resolved to the app's own copies so a
 *  slide shares one React instance with the host bundle rather than loading a
 *  second one (two Reacts break hooks). */
const RESOLVABLE: Record<string, unknown> = {
  react: React,
  // The automatic JSX runtime compiles `<div/>` into `jsx(...)` imported from
  // `react/jsx-runtime` — a different module from `react`, and the one that
  // actually exports `jsx`/`jsxs`/`Fragment`. Handing back the React namespace
  // here fails at the first element with "jsx is not a function".
  'react/jsx-runtime': JsxRuntime,
  'react/jsx-dev-runtime': JsxRuntime,
}

function requireShim(specifier: string): unknown {
  // `@open-slide/core` is upstream's public surface. In this port the same
  // types and helpers live in the app bundle, and a slide only ever imports
  // *types* from it — which the transform erases — so an empty namespace is
  // the honest answer rather than a partial re-export that could drift.
  if (specifier === '@open-slide/core') return {}
  const mod = RESOLVABLE[specifier]
  if (mod) return mod
  throw new Error(
    `a slide may not import ${JSON.stringify(specifier)} — this host bundles the app once, ` +
      `so a slide can only use react and types from @open-slide/core`,
  )
}

/**
 * Compile one slide's TSX source into a module namespace.
 *
 * `imports` are rewritten to CommonJS by Sucrase, so the evaluated body sees a
 * `require` and an `exports` object rather than ESM syntax, which `new
 * Function` cannot parse.
 */
export function compileSlideModule(source: string, filename: string): CompiledModule {
  let code: string
  try {
    code = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'automatic',
      filePath: filename,
      production: true,
    }).code
  } catch (err) {
    throw new Error(`${filename} failed to compile: ${(err as Error).message}`)
  }

  const exports: CompiledModule = {}
  const module = { exports }
  try {
    // eslint-disable-next-line no-new-func -- the whole point of this seam
    const run = new Function('require', 'exports', 'module', 'React', code)
    run(requireShim, exports, module, React)
  } catch (err) {
    throw new Error(`${filename} failed to evaluate: ${(err as Error).message}`)
  }

  const result = (module.exports ?? exports) as CompiledModule
  if (!result || typeof result !== 'object') {
    throw new Error(`${filename} evaluated to ${typeof result}, not a module`)
  }
  return result
}
