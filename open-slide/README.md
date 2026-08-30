# Open Slide

A deck app for ISPO: pages are authored against a fixed **1920 × 1080** canvas and
scaled to whatever space they are given, so a heading is the same heading in a
sidebar thumbnail, in the project pane, and in present mode.

Started from [1weiho/open-slide](https://github.com/1weiho/open-slide) (MIT,
© 2026 Yiwei Ho) as a boilerplate and taken its own way since — see
[UPSTREAM.md](UPSTREAM.md). It does not track upstream.

## What changed in the port, and why

Upstream open-slide is a framework, not an app: a CLI scaffolds a workspace, a
Vite plugin globs `slides/*` into a virtual module, and each page is an arbitrary
React component compiled per deck. An ISPO project is built by the host from one
fixed entry with esbuild, and there is no per-deck compile step, so that model
does not survive the move intact.

So a deck here is **data** — one JSON document per deck in the project's own
host-scoped storage — rendered by four bundled layouts (`title`, `content`, `section`,
`statement`) filled with typed blocks (heading, body, bullets, quote, code,
metric). A page can no longer be anything you can write in React. In exchange, a
deck can be created, listed, and read back through the host's ordinary planes,
which is what makes the `create-deck` command below possible.

One upstream affordance genuinely cannot exist here: the **presenter window**,
because a sandboxed project iframe cannot open a second window. What that window
would have held is an in-frame overlay instead — press `P` while presenting for
elapsed time, the next page, and the speaker notes.

Reveal steps do survive the move. A block carries an optional `step`: 0 (or
absent) is on the page from the start, and 1 upward are staged one keypress at a
time, so the deck advances through a page before moving to the next one.

## Commands

| Command | What it does |
| --- | --- |
| `create-deck` | Builds a deck from a title and a list of pages, including per-block `step` staging and the deck's transition. This is upstream's "describe your deck and the agent writes it", expressed as a project command instead of a CLI plus file watcher. |
| `list-decks` | Lists saved decks, most recently updated first. |

A block that fails validation is dropped rather than rendered as an empty box,
and the count comes back as `droppedBlocks` so a caller can tell that happened.

## Storage

`decks/<id>.json` in the project's own scoped storage (the host places it under
`~/ISPO/.state/<projectId>/`), one document per deck. Deck ids
are derived from the title and de-duplicated with a numeric suffix, so two decks
with the same name never resolve to the same file. Editing a deck by hand is
fine — a document that no longer parses is skipped, not fatal.

An example deck is seeded once into an empty library. Delete it and it stays
deleted.

## Editing

The **Edit** panel changes the page on the canvas: deck title, design preset and
transition, page layout, add/delete/reorder pages and blocks, each block's fields
and its reveal step, and speaker notes. Writes are debounced and flushed on
close, and the canvas shows every block while editing so nothing is hidden behind
a step you are working on.

## Keys

`→ ↓ Space PageDown` next step or page · `← ↑ PageUp` previous · `Home`/`End`
first/last · `O` overview · `Esc` leave present mode

While presenting: `B`/`W` black or white the screen · `P` presenter overlay ·
digits then `Enter` jump to a page
