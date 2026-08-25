# Adding an app to the store

The working pipeline for bringing a new app into this catalog — whether ported
from an existing open-source project or written fresh. Every rule in here was
learned by actually shipping apps through a live host (OpenCut, Moodboard,
Excalidraw, Open Slide); when a rule says a build *will* fail, it did.

The pipeline is written so an agent can run it end to end, including in a loop
over several apps at once. It ends with a **self-validation phase the
implementing agent performs against a running host**, followed by a **handoff
report for the human validator**, who has the final word. An app is not done
when it compiles; it is done when the human validator has watched it work.

---

## Phase 0 — Review the candidate app

Before writing anything, read the upstream project and answer, in writing:

1. **What is the ONE thing this app does?** The store wants apps, not
   frameworks. If upstream is a framework (CLI + dev server + plugin system),
   identify the app inside it.
2. **What is its runtime model?** The host builds every project from one fixed
   browser entry (`src/main.{tsx,jsx,ts,js}`) with esbuild + the host Tailwind
   plugin. There is no per-content compile step, no dev server, no virtual
   modules, no SSR. Anything upstream does with those must be redesigned or
   dropped.
3. **Where does its state live?** Browser storage (IndexedDB/OPFS/localStorage)
   must be rerouted to the SDK planes: project-scoped files (`fs.*`), the
   cross-app shared root (`shared.*`), Files (`files.*`), or entities.
4. **What leaves the app?** Downloads, uploads, network calls, opened windows.
   Each has a host-mediated replacement or must be dropped (see Phase 3).
5. **What genuinely cannot exist here?** Name it in the app's README rather
   than shipping a broken half-version. Known examples: a second window
   (sandboxed iframes cannot `window.open`), dev-server-coupled tooling.
   Before declaring something impossible, check whether only its *container*
   is impossible: Open Slide's presenter window is impossible, but the
   presenter *view* it contained works fine as an in-frame overlay. We wrongly
   wrote off reveal steps once because they looked coupled to upstream's
   compiled-page model; they ported cleanly onto a data model. Write down the
   impossibility argument — if the argument is about a container or a build
   step, look for the feature inside it.

**Deliverable:** a short adaptation plan (in the PR description later) naming
the app's one job, the state plan, the egress plan, and the dropped features
with reasons.

## Phase 1 — Take the code once; do not track upstream

The store's model is **boilerplate, taken once**. We copy what is useful at a
recorded commit, adapt it freely, and never sync with upstream again. Agents
improve our copy from then on. Do not add submodules, subtrees, or upstream
remotes.

Required bookkeeping (see `open-slide/UPSTREAM.md` for the shape):

- An `UPSTREAM.md` in the app folder recording: upstream URL, the exact commit
  SHA taken, the license and copyright line, which files carry upstream logic,
  and what was deliberately not carried over.
- A license-attribution header comment in each file that is a port.
- Keep upstream's LICENSE file when you vendor substantial code (Excalidraw
  does this).

Never copy into the store: `node_modules/`, `dist/`, build output, lockfiles
for package managers we don't use, CI configs, or upstream's agent/skill
directories.

## Phase 2 — Decide the permission envelope

This phase is mandatory and goes in the PR description. The app's
`.ispo/project.json` `requests` block is the **complete** list of what the host
will ever let the app ask the user for. Store installs are curation-lifted to
*Sandboxed* (undeclared capabilities become promptable rather than refused),
but the gallery shows the user a capability summary derived from this envelope
— so it must be least-privilege and it must be honest.

Work through the app's actual code paths and claim only what they exercise:

| Request key | Values | Ask for it when the app… |
| --- | --- | --- |
| `fs` | `'self' \| 'none'` | reads/writes its own project-scoped data files (most stateful apps). This is the one grant almost every app needs. |
| `ui` | `notify`, `navigate`, `command-palette`, `chat-companion` | posts notifications; asks the host to navigate; contributes palette entries; embeds the chat companion selector |
| `files` | `publish`, `pick`, `edit` | hands artifacts to Files (standing grant), opens the Files powerbox picker (per-use consent — the picker IS the consent), or edits Files objects in sessions |
| `dialog` | `saveAs` | needs the host save dialog |
| `assets` | `publish` | publishes host-chrome assets |
| `folders` | slot declarations | borrows user folders (§7.4) — declarations only, never paths |
| `agent` | `dispatch`, `session-read`, `session-control`, `hosted-runs`, `remote-coding`, `orchestrate` | drives agent sessions. Rarely appropriate for a store app. |
| `git` | `read`, `commit` | operates on its own checkout |
| `chrome` | `author`, `project-icons`, … | privileged host appearance work. Not for ordinary store apps. |
| `capability` | `invoke` | calls other projects' commands (§25) |
| `spec` | `propose` | proposes spec edits |
| `cloud` | `read`, `chat`, `support` | reads the cloud account summary / community surfaces |
| `assistant` | `memory-read`, `memory-write` | touches assistant memory. Almost never for a store app. |
| `promptHistory` | `read` | reads prompt history. Almost never. |
| `entities` | per-type map | declares durable records (pair with `entityTypes`) |
| `devices` | feature list | exotic device features (§6.1) |
| `connectors` | provider→operations map | calls provider connectors (Google mail/calendar, …). An unregistered provider or unknown operation **rejects the descriptor at parse** — do not cargo-cult another app's connectors block. |
| `egress.connect` | origin list | opens network connections. Empty for almost every store app; every entry must be justified in the PR. |
| `env` | declarations | needs user-supplied secrets (`secrets.*` is only dispatchable when non-empty) |

Rules of thumb, learned the hard way:

- **`shared` is not a request key.** `shared.*` SDK calls are ungated; a
  `shared:` block in `requests` is silently dropped (the parser warns and
  continues). Unknown keys never fail the build — which means a typo'd
  request key is *invisible* until the capability doesn't work. Diff your
  envelope against the table above, not against another app's descriptor.
- **Do not copy Moodboard/OpenCut's `connectors.google.calendar` block** into
  new apps. It is there historically, surfaces in the user-facing capability
  summary, and makes the app look grabbier than it is.
- Prefer `files: ["pick"]` over standing grants: the powerbox picker is its own
  consent surface and needs nothing pre-granted (this is how Excalidraw exports
  with no `fs` at all).
- The catalog entry's `capabilitySummary` must match the envelope in plain
  words. The gallery shows it; the human validator checks it.

**Deliverable:** the `requests`/`egress`/`env` blocks plus one sentence per
non-empty key justifying it, in the PR description.

## Phase 3 — Implementation rules (the gates that WILL fail your build)

Store installs build through the packaged pipeline with
`requireProjectCommands` hard-coded on. `"mode": "edit"` does **not** exempt
you. These are hard errors, verified by hitting each one:

1. **You must export a command catalog.** At least one meaningful
   `commands.define(...)` and exactly one
   `export const projectCommands = commands.expose([...])`, with
   `projectCommands.ready()`. Import the module for effect from your entry.
   Schema keywords are closed (`type`, `const`, `enum`, object
   `properties`/`required`/`additionalProperties`, array
   `items`/`minItems`/`maxItems`, string `minLength`/`maxLength`, numeric
   `minimum`/`maximum` — no `pattern`). Metadata and schemas must be inline
   literals; a computed schema silently drops the command.
2. **No browser-download exits.** Any `.download` assignment on a created
   `<a>` is a build error (spec §25). Artifacts leave through `files.save`
   (picker), `files.publish` (standing grant), or Assets. When porting, grep
   upstream for `URL.createObjectURL` + anchor patterns *before* building;
   OpenCut had two and each cost a full install cycle to discover.
3. **Command handlers must be headless and use `ctx.sdk`.** No DOM, no mounted
   component, no ambient SDK singleton (it drops the host's invocation
   attribution). If the app's UI needs the same behaviour, call
   `theCommand.run(...)` from the UI — one handler, two entry points, no
   drift (see Open Slide's New deck button).
4. **Dependency manifests must install under the host's vendored pnpm 10.**
   A `pnpm-lock.yaml` at `lockfileVersion: '6.0'` fails
   (`ERR_PNPm_LOCKFILE_BREAKING_CHANGE`) — regenerate at v9 **with pnpm 9**
   (`pnpm install --lockfile-only`), which reads v6 and preserves every
   resolved version; verify zero drift by diffing package@version sets. npm and
   yarn lockfiles are converted by the host via `pnpm import` (version-
   preserving). No lockfile at all resolves fresh — acceptable, less
   reproducible. Prefer no manifest at all: the host provides React,
   react-dom, and `@ispo/sdk`; Moodboard and Open Slide ship zero
   dependencies.
5. **First-run must survive the permission race.** A freshly installed app's
   first `fs.read` fires while the user is still looking at the access review;
   it may be held or refused. Treat a failed initial load as a distinct
   retrying state ("waiting for file access"), never as an empty library — and
   make sure a failed *seed* can run again after access is granted. Every app
   with `fs` hits this on its literal first launch.
6. **Layout must survive hidden frames.** A backgrounded/occluded iframe gets
   no rendering steps: no ResizeObserver callbacks, no rAF. Anything that
   measures its container must re-measure on the props that change layout, and
   on `resize`/`visibilitychange` — not rely on RO alone. Otherwise the app
   wakes up with stale geometry.
7. **Project-scoped storage lives outside the project folder.** `fs.*` writes
   land under `~/ISPO/.state/<projectId>/`, not in the app's source tree.
   Document data locations accordingly.
8. **Structural conventions:** entry at `src/main.tsx`; no `connectToHost()`
   needed (the host injects bootstrap; OpenCut calls it harmlessly, new apps
   shouldn't); no `<StrictMode>` (double-mount breaks one-time seeding);
   folder name must match `/^[a-z0-9][a-z0-9-]*$/` and equal the catalog
   `subpath`; include a `tsconfig.json` (copy Moodboard's).

## Phase 4 — Catalog entry and icon

- Icon: **raster only** (`png`/`webp`/`jpg`), one file in the app folder,
  ≤128 KiB, magic bytes must match the extension (a mislabeled file is
  rejected). SVG is never accepted. Reference the exact filename from the
  catalog entry.
- Catalog entry: closed schema `{ id, name, description, subpath, ref?,
  category?, icon, capabilitySummary? }`. `subpath` = folder name. Keep
  `capabilitySummary` in sync with the Phase 2 envelope.
- The store never carries `node_modules/` or `dist/`.

## Phase 5 — Agent self-validation (mandatory, against a running host)

Compiling is not validation. **Install the app through the real store path on
a live host and drive it.** Budget as much time for this as for
implementation; every app shipped so far had at least one bug only this phase
caught (wrong-scale present mode, permission-race deadlock, browser-download
gate, lockfile rejection).

### Harness

Run the host from the `ispo` repo with the local-store seam so installs read
your working tree instead of GitHub:

```bash
ISPO_COMPILE_E2E_TEST_SEAMS=1 ISPO_E2E=1 ISPO_E2E_TEST_SEAMS=1 \
ISPO_E2E_VISIBLE_WINDOW=1 \
ISPO_E2E_STORE_ROOT=/path/to/this/repo \
pnpm dev
```

(There is a `run-with-local-store.sh` wrapper one level above the repos that
also seeds the gallery cache.) The host exposes CDP on a loopback port; every
check below is scriptable through `ispo/scripts/cdp/eval.mjs`,
`click.mjs`, and `screenshot.mjs`. Find targets via
`curl http://127.0.0.1:<port>/json/list` — the host page plus one iframe per
project.

### Required checks, in order

Each check has a pass condition an agent can assert, not eyeball.

1. **Fresh install succeeds.** Delete any prior copy (delete the project AND
   `rm -rf ~/ISPO/<folder>` — a failed install can leave an unregistered
   folder that blocks the next attempt), then
   `installFromStore({ appId, folderName })`. Pass: a `projectId` comes back;
   no "Needs adaptation".
2. **Command catalog derived.** `~/ISPO/<folder>/dist/ispo-project-commands.json`
   lists exactly your command ids.
3. **Host discovery.** `agentSession.capabilityCandidates({scope:'home'})`
   includes your commands with `origin: "store"`, `trustClass: "sandboxed"`.
   Anything else means the install didn't take the store path.
4. **Permission envelope matches Phase 2.** The pending requests after first
   activation are exactly the declared set — nothing missing, nothing extra.
   Approve `fs` (as the user would) and confirm the app leaves its
   waiting-for-access state without a reload.
5. **First-run seed/empty state.** Whatever the app promises on first open
   actually appears, once, and doesn't resurrect after deletion.
6. **Core loop through the DOM.** Drive the app's one job end to end via CDP —
   real clicks and keydowns, asserted DOM state, not screenshots alone.
   Include keyboard paths if the app claims them.
7. **Command handlers end to end.** Invoke each command's handler (the UI
   button that calls `.run()`, or the command surface) and assert the durable
   effect on disk (`~/ISPO/.state/<projectId>/…`).
8. **Layout-change survival.** Toggle every mode that changes the container
   (present, panels, editors) and assert measured geometry — expected scale vs
   actual, container width non-zero. This is where the hidden-frame and
   grid-collapse bugs live.
9. **Restart survival.** Deactivate/reactivate (or restart the host):
   state persists, the app returns without manual repair.
10. **Screenshot for the human.** One screenshot per major surface
    (`screenshot.mjs` on the host page with the app active), saved for the
    handoff report.

If any check fails: fix, **delete the project and folder, reinstall from
scratch**, and rerun from check 1. Never validate on top of a manually patched
install.

### Known traps while validating

- CDP screenshots only work on top-level targets — screenshot the host page
  with the app pane active, not the iframe.
- The install-time access-review dialog blocks the app pane; "Done" defers
  undecided rows to the Approval Center (it grants nothing).
- The E2E seams make the host window invisible unless
  `ISPO_E2E_VISIBLE_WINDOW=1` is set. An invisible window still renders and
  answers CDP — do not mistake it for a working user-visible app.
- `store.revalidate` is stubbed under the seam; the gallery serves the local
  catalog. Icons may fall back to monograms locally — that is a seam
  limitation, not an app bug (verify the icon file's magic bytes instead).

## Phase 6 — Handoff to the human validator

The human validator has the final word and validates on their own machine. The
PR must let them do that **without reading the code first**. Include:

1. **Adaptation plan** (Phase 0): the one job, what was dropped and why.
2. **Permission envelope** (Phase 2) with per-key justification.
3. **Self-validation transcript** (Phase 5): each check, the observed value
   (numbers, not adjectives — "canvas 964×542 at scale 0.502", not "canvas
   scales correctly"), and the screenshots.
4. **Known warts, stated plainly** — anything you'd want a reviewer to push
   back on. Judgment calls (CSS approach, type stubs, dropped features) go
   here, not in silence.
5. **How to validate by hand, in order:** install from the gallery → approve
   the access review → first-run state → the core loop, step by step, with
   what should be seen at each point → each command → present/special modes →
   restart. Ten minutes, no source diving.

For bulk runs (several apps in one loop): one branch and one PR per app, each
with its own full report. A batch summary may link them, but validation is per
app; no app rides another's report.

---

## Quick checklist

```
Phase 0  □ adaptation plan written (one job, state plan, egress plan, dropped features)
Phase 1  □ code taken once at a recorded SHA  □ UPSTREAM.md  □ attribution headers
Phase 2  □ requests/egress/env minimal, justified per key  □ capabilitySummary matches
Phase 3  □ command export + ready()  □ no <a download>  □ handlers use ctx.sdk
         □ lockfile installs under pnpm 10 (or no manifest)  □ first-run access race handled
         □ layout survives hidden frames  □ entry/folder/tsconfig conventions
Phase 4  □ raster icon ≤128KiB, magic bytes match  □ catalog entry, subpath = folder
Phase 5  □ all 10 checks pass on a live host, from a scratch install
Phase 6  □ PR report: plan + envelope + transcript + warts + hand-validation script
```
