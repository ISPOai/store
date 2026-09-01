# Bento Slides

Build and present slide decks: an infinite-ish canvas editor, morph
transitions between slides that share element ids, a dependency-free chart
engine, motion paths, speaker notes, review comments, hidden interactive
states, and a present mode with a presenter view.

Ported from [nyblnet/bento](https://github.com/nyblnet/bento) — see
[UPSTREAM.md](UPSTREAM.md) for provenance and what was left behind, and
[CASE-STUDY.md](CASE-STUDY.md) for what the port cost: the premise that could
not survive, the seams that replaced it, and every failure hit on the way.

## What a deck is here

Upstream, **a deck IS a file** — one `.bento.html` carrying the document, the
viewer and the editor together, rewriting itself on every save. That is the
product's central promise and this port cannot keep it: ISPO builds a project
with esbuild into an external `main.js` and generates the surrounding HTML
itself, so there is no shell in the page for the app to serialize.

So the wrapper goes and the document stays. A deck here is **exactly the JSON
upstream keeps inside the file's `#bento-doc` block** — same model, same
version, same additive format guarantees — stored as
`decks/<name>.bento.json` in the project's private storage
(`~/ISPO/.state/<projectId>/`). Which means:

- **A `.bento.html` someone sends you still opens.** *Save ▾ → Open deck… →
  From Files…* reads the document straight out of its block.
- **A deck still leaves.** *Save ▾ → Export to Files…* publishes the document
  JSON into your Files library, and any real Bento file takes it back through
  *Replace from JSON*.
- **What is gone** is exporting a file that IS the app. Nothing else about the
  format changed.

Everything the file gave you inside the app is intact, because a deck path in
project storage behaves exactly like a file handle: ⌘S rewrites the open deck
in place, autosave writes back silently, *Save a copy…* makes a second deck.

## The library is the app's front page

Upstream opens a document, because a Bento file *is* a document and the
operating system is its library. This app owns a folder of decks, so it owes
you the shelf before the book: **it opens on "Your decks"** — every deck as a
card, with a live thumbnail of its first slide, the slide count, when it last
changed, and which one is currently open. *New deck* and *Import from Files…*
sit in that header; **Decks** in the editor's top bar goes back to it.

The thumbnails are `renderThumbnail` — the same primitive that draws the
editor's slide rail, so a card shows the real slide, not an approximation.

The library is a page, not a dialog over the editor: on a cold start there is
no editor yet. The editor is built exactly once, when you open your first deck,
and every later open swaps the document through it (`slides/src/ispo/active-editor.ts`
records why that distinction matters).

## Layout

```
bento-slides/
├── src/main.ts        ← the ISPO entry (appEntry): mount node, commands, boot
├── ispo/src/          ← the port's host adapter — NOT upstream
│   ├── store.ts       ←   decks as fs files ("the disk")
│   ├── files.ts       ←   powerbox import/export
│   ├── dialogs.ts     ←   in-frame alert/confirm/prompt (the sandbox has none)
│   └── ispo.css
├── slides/src/        ← upstream app, vendored (plus slides/src/ispo/)
│   └── ispo/          ←   boot gate, deck library, command catalog
└── kernel/src/        ← upstream shared kernel, vendored
```

`slides/` and `kernel/` sit as siblings so every upstream import
(`../../kernel/src/…`) resolves unchanged.

## What this app asks for, and why

| Request | Why |
|---|---|
| `fs: "self"` | decks, autosave snapshots and version history live in the project's own private storage. Nothing else is touched. |
| `files: ["pick", "publish"]` | `pick` — *Open deck… → From Files…*, grantless (the powerbox modal is the consent). `publish` — *Export to Files…* and the `export-deck` command, which put a deck in this project's own Files folder (`/Projects/Bento Slides`). `publish` is a standing grant, asked once. |
| `egress.connect: []` | **no network at all.** Offline mode is pinned on in `kernel/src/net.ts`, so the app refuses a request before the host's CSP has to. |

No notifications, no agent, no dialogs, no entities, no connectors, no
environment secrets.

## Dropped on purpose

Each of these is unavailable here for a structural reason, and the app says so
in place rather than offering a button that cannot work:

- **Live collaboration.** The E2EE relay needs an outbound WebSocket; this app
  declares no egress. The Share panel says so.
- **Signed self-update.** Updating means downloading a new app shell and
  rewriting the file with the document inside it. ISPO owns app lifecycle —
  reinstall from the Store. The About dialog's update switch is shown locked.
- **Downloadable language packs.** They are fetched from the release channel
  and then *live inside the saved file*; there is no file to carry one. The
  nine built-in interface languages are unaffected.
- **Self-contained `.bento.html` export.** See "What a deck is here".

## Commands

Four headless commands, all reading and writing the deck on disk through
`ctx.sdk.fs` so a host call is served whether or not the app is on screen:

| Command | Does |
|---|---|
| `list-slides` | outline the open deck — title, count, per-slide heading and notes |
| `add-slide` | append (or insert) a slide with a heading and bullets |
| `new-deck` | create a deck, optionally one slide per heading, and open it |
| `check-deck` | run the deck through upstream's validator and report the findings |
| `export-deck` | publish the open deck into this project's Files folder, returning the Files entry |

When a command changes the deck while the editor is open, the editor reloads
it as soon as the frame is in front again — unless there is an unsaved edit, in
which case it says so and leaves the author's work alone.

`export-deck` is the private store's one door to the outside, and it is the
same handler the editor's *Export to Files…* button runs — one implementation,
two entry points, so a deck exported by hand and one exported by an agent land
in the same place in the same shape. It publishes with no `folder` argument on
purpose: the host defaults a publish to the producing project's own Files
folder, which is where someone looking for this app's output goes first. The
handler reads the deck from disk, as a headless invocation must, so the button
saves an unsaved deck before publishing rather than handing out the previous
version.

This is the §25 shape for handing work back: an agent asks the app to build a
deck (`new-deck`, `add-slide`), then asks it to `export-deck`, and the result
channel is `files` — the caller receives a REF to the published entry, never
access to this app's store.

## Data locations

| What | Where |
|---|---|
| decks | `~/ISPO/.state/<projectId>/decks/*.bento.json` |
| which deck is open | `~/ISPO/.state/<projectId>/session.json` |
| crash recovery | `~/ISPO/.state/<projectId>/.autosave/recovery/` |
| version history | `~/ISPO/.state/<projectId>/.autosave/versions/<docId>/` |

Deleting the project deletes all of it — nothing is left in a browser origin.
