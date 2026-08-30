// A real ESM module that re-exports the host's React.
//
// Several vendored packages (use-sync-external-store and the @base-ui/react
// bundles that depend on it) are CommonJS and call `require("react")`. When
// react is marked external in an ESM bundle, esbuild compiles that call into a
// dynamic-require stub that throws at runtime ("Dynamic require of react is not
// supported"). Resolving react to this module instead means the CJS interop
// wrapper sees an ordinary bundled dependency, while the single `import` below
// is the one that stays external — so there is still exactly one React.
import * as React from 'react'

export * from 'react'
export default React.default ?? React
