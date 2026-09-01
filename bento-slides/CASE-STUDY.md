# Case study: porting Bento Slides

What upstream does, what this host forbids, what we did instead, and what it
cost. Written from one port; every failure listed was hit, not predicted.

Upstream: [nyblnet/bento](https://github.com/nyblnet/bento) @ `8524866`,
`slides/` — ~20k lines of vanilla TypeScript plus ~22k of compiled i18n, built
by Vite into **one HTML file that is simultaneously the document, the viewer
and the editor**. It has no framework, no dev-server coupling, no virtual
modules, and no `import.meta` — esbuild takes it almost unchanged. The hard
part is not the build. It is the premise.

## The one premise that cannot survive

> "One HTML file — deck, viewer and editor together. Open it anywhere. It saves
> itself." — the starter deck, slide 1

At boot, upstream deep-clones the live document; on save it swaps the clone's
`#bento-doc` block for the current model JSON and re-serializes the whole page.
TiddlyWiki's trick. It is the product.

ISPO builds a project with esbuild into an external `main.js` and **generates
the surrounding HTML itself** (`build-html.ts`). There is no shell in the page
to clone, and cloning what *is* there would emit a "self-contained" file whose
only script tag points back inside this install. No amount of adaptation
recovers this.

So the wrapper goes and the document stays. **A deck here is exactly the JSON
upstream keeps inside the block** — same model, same version number, same
additive-format guarantees — written to `decks/<name>.bento.json` in
project-private storage. The bytes are the same bytes; only the container is
gone. Which is why the two directions that matter both still work: a
`.bento.html` anyone sends you **opens** (its block is read out), and an
exported deck **round-trips** into any real Bento file through its own
*Replace from JSON*.

Everything the file bought *inside* the app is intact, because a deck path
behaves exactly like a file handle: ⌘S rewrites in place, autosave writes back
silently, *Save a copy…* makes a second deck.

## The seams

The port replaces the **bottom** of the app — where it touches disk, network
and the browser's own dialogs — and leaves the ~20k lines above untouched.

| Upstream mechanism | Host constraint | What we did | Trade-off |
| --- | --- | --- | --- |
| `#bento-doc` block, `capturePristine()`, `serializeFile()` | host generates the HTML; no shell to clone | `serialize*` return the document JSON; the disk half of `kernel/src/save.ts` is rewritten over `fs` | self-contained `.bento.html` export is gone; import of one still works |
| `showSaveFilePicker` + FS Access handles | no filesystem handle in a sealed iframe | a deck **path** is the handle; `hasFileHandle`/`openedFileName`/`writeUpdatedFile` keep their meaning | none — every caller above the disk layer is unchanged |
| `downloadFile()` — `a.download = name` | **hard build error**, spec §25 | deleted, not stubbed. Artifacts leave through `files.save` (powerbox) or `files.publish` | none; the powerbox modal is its own consent |
| IndexedDB autosave + version history | browser storage must move to an SDK plane | `fs` under `.autosave/`, one file per snapshot | strictly better: survives a cleared origin, travels with the project, and "did it store?" is finally answerable — upstream's own comment asks for that and could not have it |
| `netFetch`/`netWebSocket` (updates, relay, packs) | `egress.connect: []` | **pin offline mode ON** rather than delete the code | upstream had already designed every offline state; each surface now renders the copy it was written for |
| Signed self-update | ISPO owns app lifecycle, and there is no shell to splice into | `checkForUpdates()` answers `current`; the switch is shown disabled | a reader looking for "does this phone home?" still finds the answer where it always was |
| Downloadable language packs | fetched from the channel, then *stored inside the file* | stubbed | the **nine built-in** interface languages are unaffected |
| `window.alert/confirm/prompt` (17 sites) | **inert** in a frame without `allow-modals` | `<dialog>`-based replacements, `ispo/src/dialogs.ts` | all three become async; call sites restructured |
| `index.html` `#app` + splash | host's shell offers `#root` | the entry creates `#app` inside it | one function; no upstream layout code changed |
| `startTheme()` following `prefers-color-scheme` | inside a pane, the environment is the **chrome**, not the OS | `ispo:theme` feeds what `'auto'` resolves to | an explicit in-app choice still wins |
| — (upstream has no deck library) | the app owns a folder of decks | a library page: the app's front door | new surface, ~250 lines |

Upstream's `slides/` and `kernel/` are vendored as **siblings**, exactly as they
sit upstream, so every `../../kernel/src/…` import resolves unchanged and **not
one import statement was rewritten**. `src/main.ts` is a thin ISPO entry that
imports the real one.

## Issues hit, in order

1. **`alert`/`confirm`/`prompt` do nothing, silently.** No `allow-modals`, so
   Chromium ignores `alert()`, returns **false** from `confirm()` and **null**
   from `prompt()`, with only a console warning. Every destructive-action guard
   becomes "you can never do this"; every text prompt becomes "cancelled".
   Nothing throws. 17 sites, found by grep before the first install.
2. **Dark-on-dark dialogs.** The generated shell sets
   `color-scheme: dark light`; upstream's own `index.html` declares
   `content="only light"` and that declaration does not come with it. A
   `<dialog>` with no explicit background takes the *user-agent* surface, so in
   dark mode the password dialog painted near-black behind near-black text and
   read as an empty box. Every dialog surface is now pinned to theme tokens —
   which also fixes upstream's own password dialog.
3. **`buildSlidePreview` was the wrong primitive.** It is upstream's
   file-manager thumbnail and renders at *its own* size (1800px), not the
   deck's — so scaling by `doc.size.width` cropped every library card and spilled
   the first one over the page header. `renderThumbnail(slide, doc, width)`,
   which the editor's own rail uses, renders at a width you give it. **Read what
   a primitive actually returns before reusing it for a new job.**
4. **`bootBento(null, …)` boots the *starter deck*.** So the library's cold-start
   *New deck* and *Import from Files…*, which booted an editor first in order to
   borrow its handlers, both dropped the reader into the feature tour instead of
   what they asked for. Neither action needs an editor: each produces a document
   and the caller decides where to put it (`ispo/deck-actions.ts`).
5. **A back button nobody could find — twice.** First it borrowed `ICONS.copy`,
   the same glyph as *Save a copy*, in a bar that drops labels when narrow. Then
   it became a 2×2 grid, which is a fine symbol for *a library* and a bad one
   for *leave this deck*. It is now `‹ Decks`, with a CSS rule pinning that one
   label so the compact bar cannot strip it. Reported as "there is no back
   button" while the button sat two icons from the cursor.
6. **`document.visibilityState` is the wrong signal for a pane switch.** The
   editor must adopt deck changes made by its own headless commands, or the next
   save destroys them. Switching ISPO panes never changes document visibility,
   so a `visibilityState === 'visible'` guard silenced the check exactly when it
   was needed. Listen for **`ispo:focus-project`** alongside `focus` and
   `visibilitychange`, with no visibility guard.
7. **The @-mention path injects an input the schema cannot declare.**
   `capability-mention-invoke.ts` sends `input: { instruction: <typed text> }`
   unconditionally, so a correctly-closed `additionalProperties: false` schema
   rejects its own invocation with `schema-invalid`. The read commands declare an
   optional `instruction` they ignore, commented as the workaround it is.
8. **Driving the app through the frame's own CDP target hid that the pane was
   dead.** `Input` events dispatched on the iframe's target bypass the parent's
   `pointer-events`, so eleven validation checks passed against an app the user
   could not click. The measurement instrument was exempt from the very
   restriction under test. **Check
   `getComputedStyle(document.querySelector('.frame-slot.active iframe')).pointerEvents`
   once per session** — and select `.frame-slot.active iframe`, never a bare
   `querySelector('iframe')`, because the frame pool keeps warm `opacity: 0`
   frames mounted *ahead* of the active one.
9. **`node_modules` in the worktree rides the install — three times.** The
   local-store seam copies your **working tree** (`cp -r`), not a git export.
   A pnpm tree's symlinks are absolute and point back at the worktree, i.e.
   outside the installed project root, so the build sandbox refuses them:
   `Cannot read directory "node_modules/reveal.js/dist": operation not
   permitted`. Looks exactly like a host bug. Is not. Typecheck somewhere else,
   or delete `node_modules` before every install.
10. **The export handler reads from disk, as a headless invocation must** — so
    wiring the editor's *Export to Files…* to the same handler would have
    published the *previous* version whenever there was an unsaved edit. The
    button saves first, and refuses to publish if that save is cancelled.
11. **`files.publish` dedupes, it does not update.** `uniqueFilesName` renames on
    collision, so exporting the same deck twice yields `<name>-2.bento.json`.
    That single fact settles the storage design: `fs:self` is the working store,
    Files is the sharing surface, and mirroring every save into Files would
    fill the folder with copies.

## What worked best

- **Pinning offline ON instead of deleting the network code.** Offline is a
  shipped upstream feature with a designed state on every affected surface, so
  one line in `kernel/src/net.ts` turned "this cannot work here" into copy the
  authors already wrote. Deleting the code would have left blank affordances.
- **Deleting the relay, not just disabling it.** `sync/online.ts` (735 lines) and
  `sync/blobs.ts` (311) were first kept whole and unreachable, on the theory
  that dead code is cheaper than a diff. Wrong twice: it left
  `wss://sync.bento.page` in the bundle of an app whose whole claim is that it
  has no network, and "unreachable" rested on one pinned boolean rather than on
  the code. Cut to 156 and 93 lines — what survives is the part that was never
  networking (local key minting at document creation; `data:`-URI helpers). The
  blob cache went with it, which removed **the app's last use of browser
  storage**: every durable byte now lives on an SDK plane.
- **Replacing the bottom of the save layer, not its callers.** `kernel/src/save.ts`
  keeps its exported surface — `saveFile`, `writeUpdatedFile`, `hasFileHandle`,
  `openedFileName` — so ~20k lines above it never learned that a "file" is now
  an `fs` path.
- **Keeping upstream's relative directory shape.** `slides/` and `kernel/` as
  siblings meant zero import rewrites and a diff against upstream that a human
  can actually read.
- **A mocked-SDK smoke harness, before the host.** `esbuild --alias
  @ispo/sdk=<mock>` plus a ~120-line in-memory `fs`/powerbox/commands mock, served
  next to a copy of the host's generated `index.html`. Six real bugs died there
  — issues 2, 3, 4, 5 and two more — each of which would otherwise have cost a
  full install cycle. The live host is a shared, single-instance resource; do
  not spend it on bugs a browser tab finds.
- **One handler, two entry points.** `export-deck` is the same closure the
  editor button runs, so a deck exported by hand and one exported by an agent
  land in the same place in the same shape.

## What we would do differently

- **Verify the app is interactive before trusting any validation run** (issue 8).
  This is the sibling of every "the probe bypassed the restriction" mistake: an
  instrument that is exempt from the thing under test proves nothing.
- **Never run `pnpm install` in the store worktree** (issue 9). It is gitignored,
  so a real GitHub install could never carry it; only the local seam can.
- **Read a primitive's output shape before reusing it** (issue 3), and check
  what a boot function does with `null` before routing new callers through it
  (issue 4).

## Where the deck lives, and why

| | |
| --- | --- |
| working store | `~/ISPO/.state/<projectId>/decks/*.bento.json` — private, `fs:self` |
| autosave + versions | `.autosave/recovery/`, `.autosave/versions/<docId>/` |
| sharing surface | `/Projects/Bento Slides` in Files, via *Export to Files…* or `export-deck` |

`export-deck` publishes with **no `folder` argument** on purpose: the host
defaults a publish to the producing project's own Files folder, and a
caller-supplied folder would nest one level under it. It returns the §25
`files` result channel, so a caller receives a **ref** and never store access —
the sanctioned shape for an agent asking the app to build a deck
(`new-deck`, `add-slide`) and then hand the artifact back.

## Still open

PDF export is vendored and **untested**: it calls `window.print()`, the same API
class as the modals in issue 1, so it may well be a no-op. `check-deck` runs
with `measure: false` to stay headless, so it reports no text-overflow findings. The `agent-task` route —
a reasoning agent *inside* the app composing a deck from a brief, rather than an
outside agent driving `add-slide` — waits on §25's direct completion-artifact
delivery, which the spec marks as later work.

Eight host findings met along the way are in the pull request, not here; five of
them are variations on one theme — **a host modal that sets a blocking flag
without rendering, leaving the app inert with no way to answer.**
