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

## The main goal

Shipping the app is the visible output, but it is not the main goal. **Every
implementation is a probe of the host: during implementation and verification
we must figure out what bugs, gaps, and sharp edges the host application has.**
A real app exercises paths no synthetic test does — install, build gates,
permissions, storage, lifecycle, rendering — and each app stresses them from a
different angle. Treat every friction point as a potential host finding, not
just an obstacle to route around.

Concretely, while you work:

- When something behaves unexpectedly, decide **which side the defect is on** —
  the app, the guide, or the host — before working around it. A workaround
  without a diagnosis loses the finding.
- Record every suspected host bug in a **Host findings** section of the PR
  report: what you did, what happened, what you expected, and the smallest
  repro you know. Findings shipped so far by this route include: an error
  whose copy says "migration warning" while behaving as a hard error; a
  vendored tool reporting the wrong version of itself; an interactive request
  that expires unattended and strands an error toast; a failed install leaving
  an unregistered folder that blocks the retry; hidden frames silently
  dropping layout callbacks. None of these were visible until an app hit them.
- Do not silently absorb host problems into app code. If the app must carry a
  defensive workaround (a retry, a re-measure), comment it as a workaround and
  name the host behaviour it compensates for, so it can be removed when the
  host improves.

The second half of the goal is that **the pipeline itself must learn** — see
the retrospective phase at the end. An implementation that ships an app but
teaches nothing about the host or the guide is only half done.

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

## Phase 0.5 — Put the original in the human's hands before you ask them anything

Phase 0 is you reading the code. This phase is the human *using* the app. Do it
**before** the scoping questions and long before any implementation.

The reason is narrow and practical: the scoping questions in Phase 0 and Phase 2
have no obvious right answers — what to keep, what to drop, where exports go,
what the agent should drive. A human who has clicked around the real app answers
those from a picture in their head. A human who has only read your summary is
guessing, and you will build the wrong thing confidently. Getting upstream
running costs minutes; discovering in Phase 6 that the human wanted a different
app costs the whole port.

**Do this:**

1. Clone upstream into scratch space — never into the store repo. Phase 1
   governs what gets copied in, and that comes later.
2. Get it running and **give the human a URL.** Name the two or three routes
   that actually matter (`/editor` beats the landing page).
3. Say plainly **what is expected to be broken**, so the human does not report
   scaffolding as a defect: auth flows, cloud sync, anything needing API keys.
4. Say what you served **if it is not a plain upstream build** — a substituted
   dist, a demo shell, a subset. The human is evaluating what is on screen; they
   need to know how faithful it is.
5. **Then** ask your scoping questions, batched into one round, not dripped out.
6. Stop the server when the human is done with it.

**Getting upstream to boot — traps that have actually cost time:**

- **The package manager may not be on `PATH`.** `npx --yes pnpm@10 install` runs
  the right pnpm without installing anything globally or touching the machine's
  toolchain.
- **Many apps refuse to boot without environment variables**, even for
  client-only screens — a Supabase client validating its URL in middleware will
  500 the whole site on a placeholder like `x.y.z`. Write *syntactically valid*
  dummy values: a parseable `https://` URL, a JWT-shaped string. **Never ask the
  human for real credentials and never enter any.** The goal is to see the UI,
  not to exercise the backend.
- **A source build can fail on grounds that have nothing to do with the app** —
  a Node version the repo predates, a native module, a codegen step. Do not
  fight it. Serve upstream's **published dist** (`npm pack <pkg>`) behind the
  same static app shell, and tell the human that is what you did. Mermaid's
  build dies on Node 26 inside `langium`; its editor runs perfectly against the
  published `mermaid.min.js` it loads anyway.
- **The repo may be a library, not an app.** Find the app inside it (Phase 0
  rule 1) — usually an `examples/`, `demo/`, or `*-editor` package — and tell
  the human they are looking at a demo shell rather than a product, because that
  changes what "port this" should even mean.

**Deliverable:** a live URL, a short note saying what the human is looking at
and what is expected broken, and the scoping questions — in that order, in one
message.

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

**Keep upstream's directory shape, and put `appEntry` in a shim.** A port that
spans two upstream directories (an app plus a shared kernel, say) reaches
across them with relative imports — `../../kernel/src/x.ts` from one depth,
`../../../kernel/src/x.ts` from another. Vendor them as SIBLINGS under your app
folder exactly as upstream has them, and NOT ONE import needs rewriting; a
file-by-file diff against upstream also stays readable, which is what makes the
next refresh and the human's review cheap. Then make `src/main.ts` a thin
ISPO entry that imports the real one. Bento Slides is
`bento-slides/{src,slides/src,kernel/src}` for exactly this reason.

Never copy into the store: `node_modules/`, `dist/`, build output, lockfiles
for package managers we don't use, CI configs, or upstream's agent/skill
directories. Drop upstream code that is only reachable through a feature you
dropped — Bento's 22 downloadable language catalogues (~500 KB) came out with
the release channel that fetched them, and nothing in the bundle imported them
afterwards.

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
   **Tell "absent" from "refused" by the error text, not by `catch`.** Only a
   message containing `not found:` means the file genuinely is not there
   (`scoped-fs.ts` maps ENOENT to `<label> not found: <path>`); every other
   failure — a held grant, a refusal — must route to the waiting state.
   Treating them alike is what puts an empty starter document in front of
   someone whose real work is on disk, and the next autosave makes that
   permanent. Retry on a timer AND offer a button (a grant deferred to the
   Approval Center lands at a time the app cannot predict), and leave the
   waiting screen without a reload when it lands.
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
9. **`alert`, `confirm` and `prompt` DO NOTHING — silently.** The project
   iframe is sandboxed `allow-scripts allow-same-origin allow-forms` and NOT
   `allow-modals`, so Chromium ignores `alert()`, returns **false** from
   `confirm()` and **null** from `prompt()`, with only a console warning. The
   app sees a user who declined every confirmation and typed nothing into
   every prompt — so `if (!confirm('Delete this?')) return` becomes "you can
   never delete", and every text prompt becomes "cancelled". Nothing throws
   and nothing is logged by the app. **Grep any port for all three before you
   build** and replace them with in-page `<dialog>` elements (`showModal()`
   works fine — it is a DOM element, not a browser modal). Note the
   replacements are async, so their call sites have to become async too; a
   synchronous handler that must decide *now* has to be restructured, not made
   to guess. There is no host-provided confirm/prompt to fall back on.
10. **The generated shell is theme-neutral; your UA-styled surfaces are not.**
    The host's `dist/index.html` sets `:root { color-scheme: dark light }`, so
    any element that takes the USER-AGENT surface — `<dialog>` above all, plus
    bare form controls — paints from the viewer's OS mode, not from your CSS.
    An app whose upstream `index.html` declared `content="only light"` loses
    that declaration on the way in, and its dialogs render dark-on-dark. Pin
    `background` and `color` explicitly on every such element, from your theme
    tokens.
11. **`requestFullscreen()` is denied.** `fullscreen` is not in the iframe's
    `allow=` Permissions Policy (`AUTO_ALLOW_FEATURES` in
    `project-frame-permissions.ts`), so the promise rejects. A present mode, a
    lightbox or a zoomed editor must fill the PANE with its own overlay and
    treat true fullscreen as a bonus. Bento's `overlay.requestFullscreen?.().catch(() => {})`
    is the right shape: ask, ignore the refusal, and lay out for the pane.
12. **The host generates the mount node, and it is `#root`.** An upstream app
    that mounts on its own id (`#app`) finds nothing there. Create the node in
    your entry rather than teaching the app a second id, and remember `body`
    is `position: fixed; inset: 0` with `#root` owning the viewport.
13. **If you export commands that write durable state, adopt their writes.** A
    headless command can change the document on disk while the editor is open;
    without a re-read the UI renders a stale copy and the next save destroys
    the command's work — a data loss the app's own command surface caused.
    Re-read when the pane comes forward, and **not** behind a
    `document.visibilityState === 'visible'` guard: switching ISPO panes never
    changes document visibility. Listen for `ispo:focus-project` (the SDK's
    `DOM_EVENT_FOCUS_PROJECT`, dispatched on `window`) alongside `focus` and
    `visibilitychange`. A dirty document must win — say the deck changed and
    leave the author's edit alone.

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

### Before you take the host: the mocked-SDK smoke run

The live host is a shared, single-instance resource — one `--user-data-dir`, an
Electron single-instance lock, and often another agent's validation already in
it. Do not spend it on bugs a browser tab would have found.

Build your entry with the SDK aliased to a small in-memory stand-in and open it
in Chrome:

```bash
esbuild src/main.ts --bundle --format=esm --target=chrome140 --splitting \
  --outdir=/tmp/smoke --entry-names=main --chunk-names='chunk-[hash]' \
  --main-fields=module,browser,main --loader:.woff2=file --loader:.svg=file \
  --alias:@ispo/sdk=/tmp/mock/ispo-sdk-mock.ts \
  --define:process.env.NODE_ENV='"production"'
```

A ~120-line mock of `fs` (a `Map`), `files.pick`/`files.save`, and
`commands.define`/`expose` is enough to drive first-run seeding, the whole core
loop, every command handler, and the import/export paths. Give the mock a
switch that makes every `fs` call refuse (a `?deny` query param works) and you
can exercise the permission-race gate too. Serve the bundle beside a copy of
the host's generated `index.html` (`build-html.ts`) so the shell's `#root`,
fixed `body` and `color-scheme` are the real ones.

Four real bugs in the Bento Slides port were found this way, before the host
was touched: dark-on-dark dialogs, a slide-outline heuristic that returned page
numbers, save-state copy that named the wrong storage, and an
external-change watcher wired to the wrong event. Each would have cost a full
install cycle to find live.

Two things the mock CANNOT tell you, so they still belong to the host run: the
real permission ledger, and anything about the install itself. And one trap:
served over `http://`, an app that branches on `location.protocol` takes its
web-origin path (Bento showed a "this page always starts a new deck" gate that
never appears under `project://`). Read a surprise there as a harness artifact
before reading it as a bug.

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
also seeds the gallery cache.)

Two things about the seam that bite. It **copies your WORKING TREE** — `cp -r`
of `<storeRoot>/<subpath>`, not a git export — so a local `node_modules/` rides
into the installed project and the host never runs its own dependency install;
move it aside before the install if you want to test the lockfile path (you do:
that is guide rule 4). And the host takes a **single-instance lock** on a shared
`--user-data-dir`, so a second `pnpm dev` only focuses the running one: you
cannot validate alongside another agent's session, and the store root the
running host is pointed at is fixed at launch. Check
`ps eww <pid> | tr ' ' '\n' | grep ISPO_E2E_STORE_ROOT` before assuming the
host in front of you is reading your tree. The host exposes CDP on a loopback port; every
check below is scriptable through `ispo/scripts/cdp/eval.mjs`,
`click.mjs`, and `screenshot.mjs`. Find targets via
`curl http://127.0.0.1:<port>/json/list` — the host page plus one iframe per
project.

### Required checks, in order

Each check has a pass condition an agent can assert, not eyeball.

1. **Fresh install succeeds.** Delete any prior copy (delete the project, AND
   `rm -rf ~/ISPO/<folder>` — a failed install can leave an unregistered folder
   that blocks the next attempt — AND `rm -rf ~/ISPO/.state/<projectId>`, which
   `deleteProjectAndFiles` does NOT remove). Then install.

   **Install through the Store UI's Install button, and finish the review the
   way the UI does** — accept the access dialog's *Done*, then the Approval
   Center's *Mark reviewed*, exactly as
   `packages/e2e/tests/app-store-install.spec.ts` walks it. Calling
   `installFromStore(...)` over IPC and answering the `fs` ask with
   `permissionRequests.respond(...)` is faster and **wedges the host**: the
   project keeps `reviewPendingReason: "first-permission-review"`, which raises
   the proactive access batch, which sets `accessConfirmOpen`, which inerts the
   ACTIVE app frame (`pointer-events: none`) with no modal rendered and no way
   to clear it — through restarts, because the review stays pending. You will
   spend an hour deciding whether your app broke the host. It did not; the
   harness did. (Written up as a host finding: a blocking flag that outlives its
   modal is an unrecoverable state, whatever set it.)

   Pass: a `projectId` comes back; no "Needs adaptation".
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
11. **Reference build of the original.** Stand up the UNMODIFIED upstream app
    next to the port so the human validator can compare them side by side:

    ```bash
    mkdir -p .reference
    git clone <upstream-url> .reference/<app>
    git -C .reference/<app> checkout <the SHA recorded in UPSTREAM.md>
    # then install and run with UPSTREAM'S OWN toolchain, e.g.:
    cd .reference/<app> && pnpm install && pnpm dev   # or npm/yarn per upstream docs
    ```

    `/.reference/` is gitignored — nothing under it is ever committed. Rules:

    - Check out the **exact SHA from `UPSTREAM.md`**, not upstream HEAD: the
      comparison is against what we took, or feature drift upstream reads as
      bugs in the port.
    - Run it with upstream's own toolchain, untouched. If it needs a config
      tweak just to boot (a port number, an env var), record the tweak in the
      handoff report.
    - Leave it running and note the URL. If it cannot run on this machine
      (needs a backend, platform-locked), say so in the report and substitute
      upstream's hosted demo URL if one exists.
    - Write a **parity table** while both are in front of you — every
      user-visible behaviour of the original: `same | adapted | dropped`,
      with one line of why for every non-`same` row. This is the agent's own
      first pass of the comparison the human will repeat; surprises belong in
      the table, not in the human's lap.

If any check fails: fix, **delete the project and folder, reinstall from
scratch**, and rerun from check 1. Never validate on top of a manually patched
install.

### Known traps while validating

- CDP screenshots only work on top-level targets — screenshot the host page
  with the app pane active, not the iframe.
- **`Input` events on the FRAME's own CDP target bypass the parent's
  `pointer-events`.** That is how you drive the app, but it also means your
  clicks keep working while a real user's do not — you can validate a whole app
  without noticing the pane is inert. Check
  `getComputedStyle(document.querySelector('.frame-slot.active iframe')).pointerEvents`
  once per session. And always select `.frame-slot.active iframe`: the pool
  keeps warm, `opacity: 0` frames mounted at the same rect AHEAD of the active
  one, so a bare `querySelector('iframe')` reads the wrong element. `iframe.inert`
  is never set on the DOM node and always reads false.
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
6. **Host findings** (may be empty, but say so explicitly): every suspected
   host bug or sharp edge met during implementation and validation, each with
   observed vs expected behaviour and the smallest repro. Mark any app-side
   workaround that compensates for a host behaviour, so the workaround can be
   retired when the host is fixed.
7. **The side-by-side comparison:** where the reference build is running
   (`.reference/<app>`, its URL, how to relaunch it), the parity table from
   check 11, and which rows deserve the human's eyes first — typically the
   `adapted` rows, since `same` should look identical and `dropped` is already
   argued in the adaptation plan. The human validator compares the two apps
   directly; the port does not have to be pixel-identical, but every
   difference must be one the table already names.

## Phase 7 — Retrospective: feed what you learned back into this guide

After the app is finished — validation done, report written — stop and ask,
in writing, before moving to the next app:

1. **What did this implementation teach that the guide does not already say?**
   A gate that failed for a new reason, a permission subtlety, a validation
   check that should have existed, a trap that cost an hour.
2. **What did it reveal about the host?** Anything in the Host findings
   section that changes how the next app should be built belongs in the guide
   too (as a rule or a trap), not only in the PR report.
3. **Did the guide say anything wrong?** A rule that did not hold, an
   impossibility that turned out to be possible, a step in the wrong order.
   Wrong guidance is worse than missing guidance — fix it first.

If any answer is non-empty, **update this guide in the same PR** as the app
(or a small follow-up PR if the change is large), so the next implementation —
possibly a different agent in the same loop — starts from everything this one
learned. The guide's own history is the intended proof of this loop: the
build-gate list, the permission traps, the hidden-frame rule, and the
reference-build comparison each came out of one implementation's retrospective.

In bulk runs, run the retrospective per app, not once at the end of the batch:
later apps in the loop should benefit from earlier apps' lessons.

For bulk runs (several apps in one loop): one branch and one PR per app, each
with its own full report. A batch summary may link them, but validation is per
app; no app rides another's report.

**Branch naming:** branches are namespaced by the agent that did the work —
`claude/<topic>` for Claude, `codex/<topic>` for Codex (e.g.
`claude/add-open-slide`, `codex/fix-opencut-export`). The prefix says who to
hand follow-up work to and lets parallel agent runs coexist without collisions.

---

## Quick checklist

```
Phase 0  □ adaptation plan written (one job, state plan, egress plan, dropped features)
Phase 0.5 □ upstream running  □ URL + "what's expected broken" given to the human  □ scoping questions asked AFTER they looked
Phase 1  □ code taken once at a recorded SHA  □ UPSTREAM.md  □ attribution headers
Phase 2  □ requests/egress/env minimal, justified per key  □ capabilitySummary matches
Phase 3  □ command export + ready()  □ no <a download>  □ handlers use ctx.sdk
         □ lockfile installs under pnpm 10 (or no manifest)  □ first-run access race handled
         □ layout survives hidden frames  □ entry/folder/tsconfig conventions
         □ no alert/confirm/prompt anywhere  □ dialogs/controls pin their own colours
         □ no reliance on requestFullscreen  □ mount node created (#root, not #app)
         □ command writes are adopted by the open UI
Phase 4  □ raster icon ≤128KiB, magic bytes match  □ catalog entry, subpath = folder
Phase 5  □ mocked-SDK smoke run in a browser FIRST (cheap bugs found there)
         □ all 11 checks pass on a live host, from a scratch install
         □ reference build of upstream running from .reference/ at the recorded SHA
Phase 6  □ PR report: plan + envelope + transcript + warts + hand-validation script
         □ host findings (or an explicit "none")  □ parity table + reference build location
Phase 7  □ retrospective written  □ guide updated with anything it taught
```
