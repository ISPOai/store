# Video Studio (ISPO Store app)

An offline video editor for ISPO, adapted from the open-source
[Diffusion Studio](https://github.com/diffusionstudio/editor) engine
(MPL-2.0). See `ATTRIBUTION.md` for license/attribution and
`PROVENANCE.json` for the exact upstream pin and per-file provenance.

## What it does

- Compositions are durable `video.composition` entity documents; the editor
  boots, edits, and exports entirely inside the project frame. Documents are
  migrated to the current schema version once at ingress
  (`src/domain/migrations.ts`) and every save rides two optimistic guards:
  the document revision and the entity row version.
- Media import goes through the ISPO powerbox (`files.pick`) and stores only
  the host-minted controlled reference URL in `video.asset` records — no
  bytes, paths, or browser handles in durable state. Imported media lands in
  the library panel, optionally grouped under `video.asset-folder` records,
  and any persisted asset can be re-inserted on the timeline without
  re-picking.
- The timeline supports select, drag-move, trim, delete, undo/redo
  (snapshot history), and a debounced autosave with revision guarding.
- Export renders through the vendored encoder into memory and delivers to a
  destination the user chooses: the Files library through the powerbox save,
  or an explicit off-platform save through the OS save dialog
  (`files.export`, display names only — no OS path is ever recorded).
  Every non-delivered outcome (cancel, refusal, failure) leaves the
  composition untouched; a `video.export-job` record tracks each run. When
  this frame lacks the browser capabilities export needs (cross-origin
  isolation / SharedArrayBuffer / WebCodecs), the capability screen says so
  truthfully and editing keeps working.
- Typed commands (`src/commands/`): `create-composition`, `import-media`,
  `inspect-timeline`, `apply-timeline-patch`, `render-preview`, and
  `export-video`. The UI reuses the command `.run()` paths for
  durable-state-first workflows (new composition, Files export); live-session
  workflows (powerbox import, inspector edits, library insert) keep the
  session path for undo history and share the same pure clip builders the
  commands use. Command readiness is published only after the initial
  project list proves the entity store usable.
- A bounded assistant context (active project, selection, save/export
  status) is published to the host assistant surface; it never carries
  media bytes, entity ids, reference URLs, filesystem paths, or credentials.

Nothing here talks to a server: no remote fonts, no analytics, no upstream
accounts. The only network-adjacent action is fetching same-origin
`assets://` media references the host itself minted.

## Concurrent writers

Autosave and a command editing the same composition (for example an
agent-driven `apply-timeline-patch` while the editor is open) are both
optimistically guarded: whichever writes second fails loudly with a save
error badge instead of silently overwriting the other. Closing and
reopening the composition reloads the durable document.

## Layout

```
.ispo/project.json     closed ISPO descriptor (solid target, video.* entity types)
vendor/diffusionstudio MPL-2.0 engine packages (assets, encoder, jsx, reconciler, runtime)
src/domain             closed-schema validators, migrations, entity services, pure clip builders
src/editor             engine session, document codec, timeline math, export, render preview
src/capabilities       truthful capability probes
src/ui                 Solid views (automatic JSX runtime conventions)
src/commands           typed project commands (handlers are engine-free and node-testable)
src/app                controller, export status, assistant-context binding
assets/fonts           Inter (SIL OFL 1.1)
icon.png               original placeholder artwork (generated geometry)
```

## Developing and testing

The app has no `node_modules` in the Store repository — the host installs
`package.json` dependencies at install time and resolves Solid from its own
framework palette. For local checks, use a scratch checkout:

```sh
# from a scratch copy of this folder:
npm install --ignore-scripts
npx tsc -p .            # typecheck (add paths for @ispo/sdk → your host checkout)
node --test 'src/**/*.test.ts'
```

`node --test` runs the pure-domain suites (schemas, migrations, services,
clip builders, delivery semantics, command handlers, assistant brief) under
Node's type stripping; the engine, render, and UI layers need the host
build.

## Regenerating provenance

After editing anything under `vendor/diffusionstudio`, regenerate the
machine-readable manifest against a clean clone of the pinned upstream
revision:

```sh
node scripts/regen-provenance.mjs <path-to-upstream-clone@aeb873b>
```
