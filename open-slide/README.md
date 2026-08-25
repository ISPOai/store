# Open Slide

A deck app for ISPO: pages are authored against a fixed **1920 × 1080** canvas and
scaled to whatever space they are given, so a heading is the same heading in a
sidebar thumbnail, in the project pane, and in present mode.

Adapted from [1weiho/open-slide](https://github.com/1weiho/open-slide) (MIT,
© 2026 Yiwei Ho). The canvas fit-scaling, the design-system CSS variables, and
the keyboard bindings are ports of that project's runtime; the rest is written
for this host.

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

Two upstream affordances are deliberately absent rather than half-built:

- **Presenter window** — a second window with notes and a timer. A sandboxed
  project iframe cannot open one.
- **Per-page reveal steps** — they belong to the compiled-React page model.

Speaker notes survive as a per-page field, shown beside the deck rather than in a
separate window.

## Commands

| Command | What it does |
| --- | --- |
| `create-deck` | Builds a deck from a title and a list of pages. This is upstream's "describe your deck and the agent writes it", expressed as a project command instead of a CLI plus file watcher. |
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

## Keys

`→ ↓ Space PageDown` next · `← ↑ PageUp` previous · `Home`/`End` first/last ·
`O` overview · `Esc` leave present mode
