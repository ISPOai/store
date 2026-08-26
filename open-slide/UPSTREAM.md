# Where this came from

This app is a **port** of [1weiho/open-slide](https://github.com/1weiho/open-slide)
(MIT, © 2026 Yiwei Ho), taken once at commit
`663c9578aa00c1107a1b697f79d96ec0a6d471d6` (2026-08-24, `@open-slide/core` 1.19.1).

Unlike the earlier `open-slide` app in this store — which was a
re-implementation sharing about 3.5% of its source with upstream — this is the
real thing: upstream's application code is vendored and runs unmodified apart
from the seams listed below.

**This is not a fork and does not track upstream.** No submodule, no subtree,
no remote. Upstream's `LICENSE` is kept beside this file because substantial
code is vendored.

## What was taken

| Vendored from `packages/core/src/` | Into | Lines |
| --- | --- | --- |
| `app/` — every route, component, hook and lib | `src/app/` | ~20,100 |
| `editing/` — Babel-based source editing ops | `src/editing/` | ~900 |
| `locale/` — en, ja, zh-cn, zh-tw | `src/locale/` | ~700 |

Not taken: `cli/` (the scaffolder is not an app), `vite/` (the dev server and
its plugins are replaced — see below), `http/`, `files/` (node-only), and the
test suites.

## The seams — everything that differs from upstream

Upstream is a Vite app whose dev server *is* the product. Two boundaries had to
be re-served; the UI code between them is untouched.

**1. `virtual:open-slide/*` → `src/virtual/*`.** Upstream generates four
virtual modules at build time. Here they are ordinary modules with identical
contracts, resolved through `tsconfig.json` `paths` so no vendored import
statement changes:

- `slides` — upstream globs `slides/*/index.tsx` and emits a dynamic
  `import()` per slide. This host builds one fixed entry with esbuild and has
  no per-content compile step, so a slide is compiled **at runtime**: its
  source is read from project storage, transformed TSX→JS with Sucrase, and
  evaluated with `new Function` (`src/runtime/slide-module.ts`). `new Function`
  works inside the sandboxed project iframe; dynamic `import()` of a `blob:` or
  `data:` URL does not, which is why the compiled body is evaluated rather than
  imported. A slide gets the app's own React instance injected, so there is
  never a second copy.
- `config` — static; `base`/`port` describe a dev server that does not exist.
- `folders`, `themes` — read from project storage.

**2. The `/__*` dev-server API → `src/runtime/dev-server-shim.ts`.** Upstream's
app calls `/__edit`, `/__slides`, `/__folders`, `/__notes`, `/__design`,
`/__assets`, `/__comments` over HTTP. There is no server here, so `fetch` is
patched before the app mounts and those routes are answered in-process against
project-scoped storage, keeping the same wire shapes. The workspace layout on
disk matches an upstream workspace: `slides/<id>/index.tsx`,
`slides/.folders.json`, `themes/<id>.md`.

**3. Two edits inside vendored code**, both marked in place:

- `app/app.tsx`: `BrowserRouter` → `HashRouter`. A project iframe is served
  from `project://<projectId>/` with no server to answer a pushed path, so
  history routing would 404 the app on reload.
- `import.meta.env` → `__OSD_ENV__` and `import.meta.hot` → `__OSD_HOT__`
  across 21 files (56 references), a mechanical rewrite. The host builds ESM
  with code splitting, so `import.meta` is per-chunk and cannot be patched once
  from the entry. `src/runtime/env.ts` publishes the globals before any
  vendored module body runs. **`DEV` is true**: upstream gates its entire
  authoring surface — create/rename/delete, folder drag-and-drop, the
  inspector, the style panel — behind `import.meta.env.DEV`, and the authoring
  app is the app being ported.

## What cannot exist here

- **The presenter window.** A sandboxed iframe cannot `window.open`. The
  presenter *route* still exists; what it shows belongs in an in-frame overlay.
- **HTML/PDF/PPTX export**, for now. A browser download is a build error in
  this host (spec §25); these need re-routing through Files (`files.save`).
  `config.build.allowHtmlDownload` is false.
- **Icon search** (`/__svgl`), which is an outbound call to svgl.app. This app
  declares no egress.
- **Dev-server lifecycle and the package updater** (`/__restart-server`,
  `/__update-*`) — there is no server process to restart or upgrade.
- **HMR.** `import.meta.hot` is undefined, so the inspector's
  refresh-on-hot-update paths are inert; edits refresh through the app's own
  reload of a slide module instead.

## Status

Compiles clean against the host's esbuild options. **Not yet installed or
validated on a live host** — see the PR for the remaining work.
