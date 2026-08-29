# Video Studio — attribution and source notice

Video Studio is an ISPO Store app: an offline video editor built on the ISPO
project app platform (`@ispo/sdk`, the `solid` project target). It is adapted
from the open-source Diffusion Studio editor.

## Upstream provenance

- Upstream project: Diffusion Studio — https://github.com/diffusionstudio/editor
- Pinned upstream revision: `aeb873bfc6c239a05821c9af307fca34a06e8928`
- Upstream version at that revision: 0.200.0 (2026-08-27)
- Upstream license: Mozilla Public License 2.0 (MPL-2.0)

The exact per-file provenance of every vendored file — including the SHA-256
of each file as it exists in the pinned upstream revision — is recorded in
`PROVENANCE.json` next to this file. That manifest is machine-readable and is
the source of truth for "which files came from upstream".

## What is vendored and under which license

- `vendor/diffusionstudio/assets/` — adapted from upstream
  `packages/assets` (MPL-2.0).
- `vendor/diffusionstudio/encoder/` — adapted from upstream
  `packages/encoder` (MPL-2.0).
- `vendor/diffusionstudio/jsx/` — adapted from upstream `packages/jsx`
  (MPL-2.0).
- `vendor/diffusionstudio/reconciler/` — adapted from upstream
  `packages/reconciler` (MPL-2.0).
- `vendor/diffusionstudio/runtime/` — adapted from upstream
  `packages/runtime` (MPL-2.0).

Every file under `vendor/diffusionstudio/` remains MPL-2.0. Mozilla Public
License notices and copyright notices present in those files are preserved. A
copy of the MPL-2.0 is shipped as `LICENSE-MPL-2.0.txt` beside this file.
Per the MPL's file-level notices requirement, the corresponding source for
every MPL-covered file in a distributed build of this app is available from
the upstream repository at the pinned revision above, plus this Store folder
(which contains the exact adapted source).

`assets/fonts/inter-variable.ttf` is the Inter variable font by The Inter
Project Authors, licensed under the SIL Open Font License 1.1
(`assets/fonts/OFL.txt`). It is not Diffusion Studio code and is not
MPL-covered.

## What is NOT vendored

To keep this adaptation offline and free of hosted-service authority, the
following upstream surfaces are deliberately excluded, per the adoption plan
in `../docs/diffusion-studio-adoption.md`:

- the Electron desktop app, updater, deep links, and CLI socket
  (`apps/desktop`, `apps/cli`);
- accounts, authentication, Supabase, the hosted Service, public API,
  billing, credits, and generation backends;
- Sentry, analytics, and any telemetry;
- upstream brand assets, logos, and remote font/asset fetches (the vendored
  engine's remote-font fixture table is data only and is never read by this
  app; fonts are bundled locally);
- generated installs and build output (`node_modules`, `dist`).

## ISPO-original code

Everything under `src/` is original ISPO Store code that drives the vendored
engine through its public API. It calls only ISPO platform surfaces
(`files.pick` for media import, `files.save` for export delivery, the
`video.*` entity types declared in `.ispo/project.json`, and typed project
commands). It is offered under the same MPL-2.0 to keep the app's licensing
simple; nothing here extends MPL coverage to the ISPO host or to other apps.

## Trademarks

"Diffusion Studio" and its branding are not used by this app. MPL-2.0 grants
no trademark rights. The app's own name, icon, and copy are original.
