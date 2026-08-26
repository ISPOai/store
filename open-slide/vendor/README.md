# vendor/

The app ships **no dependency manifest at its root on purpose**. The host runs a
managed `pnpm install` for any app that has one, and this app needs nothing at
runtime: every dependency is pre-bundled into `dist/` and mapped by the app's
`tsconfig.json` `paths`.

`package.json` and `pnpm-lock.yaml` here are *build tooling only* — the pinned
versions the bundles were produced from. They are never installed by the host.

Regenerate after changing a dependency:

```sh
cd vendor && pnpm install
pnpm vendor        # dist/*.js       — one bundle per package entry point
pnpm vendor:css    # ../src/app/vendor.css
pnpm manifest      # ../src/generated/slide-manifest.ts (after adding a slide)
```
