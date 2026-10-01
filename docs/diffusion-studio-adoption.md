# Diffusion Studio → ISPO adoption plan

Status: feasibility plan; do not add a Store catalog entry until the release gates below pass.

## Upstream baseline

- Repository: <https://github.com/diffusionstudio/editor>
- Inspected revision: `aeb873bfc6c239a05821c9af307fca34a06e8928`
- Revision date: 2026-08-27
- Upstream version at that revision: `0.200.0`
- Intended Store folder: `video-studio/` (working name only)

Pin the full commit in every import record. Upstream updates are reviewed migrations,
not an automatically moving dependency.

## Decision

Adopt the open-source editor as a rebranded, offline-first ISPO project app. Keep
the upstream Solid editor and media engine; do not port 175 Solid components to
React. Add the missing host-owned Solid project target first, then replace the
Electron, filesystem, account, hosted-service, and telemetry edges with ISPO
capabilities.

The first release includes local media import, editable timelines, preview,
project persistence, and local export. It excludes upstream login, billing,
credits, generative-AI calls, public API access, analytics, crash reporting,
auto-update, deep links, the Electron shell, and the `dapi` Unix-socket CLI.

This is an adaptation, not a wrapper around the existing desktop app. ISPO must
never start a second Electron application or expose an unrestricted local
filesystem bridge to the iframe.

## Legal and identity gate

The repository code is MPL-2.0. The license permits modification and
distribution, including as part of a larger work, subject to its file-level
source and notice obligations. For every upstream-derived source file:

1. Preserve its MPL notice and copyright notices.
2. Keep the derived file under MPL-2.0.
3. Ship a copy of MPL-2.0 and an attribution/source document naming the pinned
   upstream revision and the public location of the corresponding source.
4. Make all modified MPL-covered source available with the distributed app.
5. Track upstream-derived and ISPO-original files explicitly; do not imply that
   the entire ISPO host has become MPL-covered.

MPL-2.0 grants no trademark rights. `apps/desktop/assets/` is expressly excluded
from the repository license. Do not copy the Diffusion Studio name, logos,
desktop icons, protocol name, or other brand assets. Create a new raster Store
icon and use the working product name only after an identity review.

Diffusion Studio's hosted Service is governed separately from the source code.
Its current terms prohibit reselling, sublicensing, or white-labeling that
Service without written consent. Therefore the ISPO build must not connect to
Diffusion accounts, Supabase, credits, billing, generation APIs, or the public
Diffusion API. A later hosted-service integration requires written permission
and a separate security/product review; the open-source license is not that
permission.

Release evidence:

- legal owner signs off on the exact notice/source bundle;
- product owner signs off on the new name and artwork;
- an automated scan finds no excluded desktop brand asset in `video-studio/`;
- an automated network test finds no Diffusion, Supabase, Sentry, Umami, Stripe,
  or upstream API request during boot, edit, import, render, or export.

## Why a host prerequisite is required

ISPO v1 currently accepts only `target: "react"`. Diffusion's web app uses
Solid, `vite-plugin-solid`, `vite-plugin-solid-svg`, Tailwind's Vite plugin, and
the TypeGPU transform. Copying `apps/web/src` into the Store would fail the host
build and would tempt the app to execute an arbitrary upstream Vite config,
which ISPO's locked build model intentionally forbids.

Add a first-party `solid` target rather than allowing per-project build plugins:

- register a closed `solid` target adapter and Solid JSX compiler in the host;
- add a Solid scaffold and first-paint readiness implementation;
- add `@ispo/sdk/solid` only for framework conveniences; keep all RPC and
  lifecycle transport in framework-free `@ispo/sdk`;
- resolve Solid from the reviewed host palette and project libraries from the
  managed project dependency tree;
- compile SVG imports to inert URLs or checked-in components through the target
  adapter, not upstream Vite execution;
- produce Tailwind CSS through a host-owned, pinned adapter or replace the
  utility source with reviewed static CSS;
- either add a reviewed host-owned TypeGPU transform or remove the one
  frame-triage feature that requires it from v1;
- preserve the same bootstrap, build-id acknowledgement, HMR/full-reload, CSP,
  and `runtime.readiness.notify()` contract as React (imported from
  `@ispo/sdk/runtime`).

This host work changes the SDK surface and must update both bundled `ispo-sdk`
skill copies and their lock hashes as required by the root repository guidance.

Acceptance criteria for the prerequisite:

- a minimal Solid project builds and runs under `project://` in development and
  a packaged app;
- the SDK is a single shared core instance and project RPC works;
- theme, lifecycle sleep/wake, focus handoff, fresh-build acknowledgement, and
  first-paint readiness pass target tests;
- project-supplied Vite/PostCSS/compiler config is never imported by Electron
  main;
- the target-specific test and Oxlint suites have zero new debt.

## Browser/runtime feasibility spike

Before vendoring the full editor, build a small project containing only the
upstream runtime, one composition, preview, and one short export. Prove:

1. `VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`, WebGPU, and
   `OffscreenCanvas` availability in the actual project iframe.
2. Whether `SharedArrayBuffer` is available. The encoder constructs one
   directly, while upstream Vite development supplies COOP/COEP headers. ISPO's
   current project response surface does not yet establish this requirement.
3. Media workers, AudioWorklets, blob media URLs, and emitted WASM/assets load
   under the generated project CSP.
4. A 10-second 1080p composition previews, scrubs, and exports without a helper
   process or public network access.
5. Sleep/wake releases decoders, audio contexts, GPU resources, workers, object
   URLs, and frame caches, then restores the project without duplicate work.

If cross-origin isolation cannot be safely added per `project://<projectId>`
without weakening other projects, stop the adoption. Do not silently replace
`SharedArrayBuffer` with a slower or semantically different path. If local
browser encoding works, stay a static project app; a sealed loopback server is
not justified. If a helper becomes unavoidable, it must be a reviewed,
host-allocated `loopback-server` process reached only through same-origin
`/api`, with zero outbound network by default.

## ISPO boundary mapping

| Upstream edge | ISPO replacement |
| --- | --- |
| Electron `window.desktop` bridge | Framework-free `@ispo/sdk` calls and local browser engine state |
| Native open/folder dialogs | `files.pick` for object-scoped media selection |
| Native save dialog | `files.save`/`files.publish`; `files.export` only for explicit off-platform export |
| Project-root paths and file watchers | No iframe paths; host-minted Files references plus explicit app state |
| `package.json` as an app database | Declared Entities for projects, timelines, folders, assets, and export jobs |
| IndexedDB preferences | Keep only disposable UI preferences; meaningful records belong in Entities |
| Electron compilation/source editing | ISPO project commands and, only where source-folder adoption is required, reviewed `fsExternal` slots |
| `dapi` Unix socket and CLI | Typed `commands.define`/`commands.expose` capabilities |
| Supabase auth and upstream account | Omit from v1; do not substitute raw OAuth/API calls |
| Upstream generation API | Omit from v1; future generation uses an ISPO-native AI/connector capability |
| Sentry and upstream analytics | Remove; use no third-party telemetry from the project iframe |
| Remote font fixtures | Bundle licensed fonts or declare narrowly reviewed `externalAssets` rules |
| Export to an OS path | Publish a bounded/streamed artifact to Files, then let the user choose any external save |

### Proposed durable domain

Use named, versioned entity types rather than one opaque editor JSON blob:

- `video.project`: title, dimensions, frame rate, duration, active composition,
  and schema version;
- `video.composition`: ordered scene graph/timeline document and revision;
- `video.asset`: stable app metadata pointing to a host-controlled Files object;
- `video.asset-folder`: library hierarchy and ordering;
- `video.export-job`: requested format/range, progress state, result Files ref,
  and bounded failure details.

Large media bytes never enter Entities. They remain in Files or in
host-controlled references. Store only opaque references returned by the host,
never absolute paths or serialized browser handles. Validate imported upstream
documents once at ingress and migrate them explicitly by schema version.

### Proposed commands

Expose the smallest useful agent surface after the UI is stable:

- `create-composition`
- `import-media`
- `inspect-timeline`
- `apply-timeline-patch`
- `render-preview`
- `export-video`

Command metadata is static and bounded. Inputs use closed schemas, handlers
reuse the same domain services as UI actions, and consequential export reports
an immediate pending state. Do not reproduce the broad `dapi` process/socket
surface inside the iframe.

## Delivery phases

### Phase 0 — legal and technical gates

- Record the pinned upstream revision and file provenance manifest.
- Approve the new identity and license/source delivery mechanism.
- Land and verify the Solid target.
- Complete the WebCodecs/cross-origin-isolation spike.
- Produce a go/no-go note. No Store folder or catalog entry yet.

Exit: all legal gates pass and a minimal isolated Solid project exports a
10-second video in packaged ISPO.

### Phase 1 — vendored offline editor shell

- Add `video-studio/` with `.ispo/project.json`, source, lockfile, MPL license,
  attribution/source instructions, and original raster icon.
- Vendor only the upstream web/editor and engine files required by the offline
  path; exclude Electron, updater, deep links, desktop assets, CLI socket,
  account, billing, generation, and telemetry modules.
- Replace router assumptions and call `runtime.readiness.notify()` after the first
  visible Solid paint.
- Start with no network or environment requests.

Exit: the app boots offline in a quarantined Store install and renders a blank
editable composition with no CSP violations.

### Phase 2 — Files and persistence

- Import multiple local media objects through `files.pick`.
- Resolve media from controlled URLs without exposing paths.
- Persist the proposed Entities transactionally with schema migrations.
- Restore projects after reload and sleep/wake.
- Publish exports to Files with progress, cancellation, and failure recovery.

Exit: create, edit, reload, export, reopen, and save-back tests pass without
deprecated `fs.*`, `shared.*`, or `blobs.*` calls.

### Phase 3 — editing parity and hardening

- Bring over timeline, inspector, captions, transforms, audio, and supported
  effects in bounded slices.
- Add lifecycle cleanup, memory ceilings, long-project virtualization, and
  deterministic cancellation.
- Remove or replace every remote font, voice preview, and URL fetch.
- Run rendered visual QA at desktop and narrow widths in light and dark themes.

Exit: representative image, audio, caption, and video projects satisfy the
performance and recovery matrix below.

### Phase 4 — agent surface

- Extract domain services from UI event handlers.
- Add the six typed commands and static usage copy.
- Publish bounded assistant context for active project, selection, timeline,
  and export state.
- Exercise every command locally and through host dispatch with the same
  permission checks and idempotency behavior.

Exit: agent edits produce the same state transitions and undo/recovery behavior
as equivalent user actions.

### Phase 5 — Store release

- Add the final catalog entry only after all earlier exits pass.
- Keep the manifest's request envelope least-privilege and explain each request
  in `capabilitySummary`.
- Test sparse-clone installation at the pinned Store ref, quarantine review,
  dependency installation, build, first launch, update review, and rollback.
- Publish the exact corresponding MPL source for the shipped revision.

## Verification matrix

The release candidate must pass:

- upstream-derived unit tests retained for the vendored engine;
- Solid target build/typecheck tests and project SDK contract tests;
- scoped all-rule Oxlint with zero new findings in every changed TypeScript file;
- `git diff --check` and license/provenance checks;
- development and packaged ISPO boot under `project://`;
- offline boot/edit/export with the network disabled;
- CSP report assertion: no undeclared connect, font, image, media, worker, or
  script source;
- import: image, WAV/MP3, MP4/WebM, multi-file, cancellation, malformed file,
  unsupported codec, and large-file behavior;
- edit: scrub, split, trim, reorder, undo/redo, caption, transform, and audio
  synchronization;
- export: cancel, retry, app sleep, host reload, disk pressure, unsupported
  encoder, and publish failure without losing the edit;
- lifecycle soak: repeated project switching and sleep/wake with stable DOM,
  heap, worker, decoder, audio-context, and GPU-resource counts;
- no secret values, absolute paths, browser file handles, or media bytes in
  Entities, logs, command output, or telemetry;
- source/notice bundle reproducibly maps every shipped MPL file to the pinned
  upstream revision or an ISPO modification.

## Explicit stop conditions

Stop and revisit the product decision if any of these remain true after Phase 0:

- packaged `project://` cannot provide the isolation required for the encoder;
- the editor requires an unrestricted filesystem/Electron bridge for its core
  editing loop;
- the project build can work only by executing arbitrary upstream Vite config;
- the offline slice cannot be separated from Diffusion's hosted Service;
- legal review cannot establish a compliant source-delivery and non-trademarked
  identity;
- representative exports exceed acceptable memory or block the renderer often
  enough to degrade the host shell.

## First implementation slice

The next coding change should be a host-owned Solid target spike in a dedicated
branch, not a `video-studio/` copy. Its fixture should import
`@diffusionstudio/runtime`, `@diffusionstudio/encoder`, and a single local media
file, then report the browser capability matrix and attempt one short export.
That result decides whether the full adoption proceeds and prevents a large
vendoring commit from outrunning the only genuine platform blocker.
