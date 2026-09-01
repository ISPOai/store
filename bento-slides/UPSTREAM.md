# Upstream provenance

This app is **boilerplate taken once**, per `docs/adding-an-app.md` Phase 1.
There is no submodule, no remote, and no sync path back to upstream. From here
on, this copy is improved in this repo.

| | |
|---|---|
| Upstream | <https://github.com/nyblnet/bento> |
| Commit taken | `8524866cae7a1512623eac112b0871869e2f9a6a` (2026-08-28) |
| App version at that commit | `bento/slides` 1.0.18 (`slides/package.json`) |
| License | MIT — © 2026 The Bento authors (`LICENSE`, vendored verbatim) |
| Document format | `bento/slides` version 1 — unchanged by this port |

## What was taken

| Here | Upstream | Notes |
|---|---|---|
| `slides/src/` | `slides/src/` | the app: model, renderer, editor, present mode, charts, animation, i18n |
| `kernel/src/` | `kernel/src/` | the shared Bento kernel: save, autosave, theme, net, i18n, tokenizer, CRDT |
| `LICENSE` | `LICENSE` | MIT, verbatim |

The two directories keep their upstream paths **relative to each other** on
purpose: every module in `slides/src` reaches the kernel as
`../../kernel/src/…`, so not one of those imports had to be rewritten and a
file-by-file diff against upstream stays readable.

`src/` and `ispo/src/` are NOT upstream — they are this port (see README.md).

## Files carrying upstream logic

All of `slides/src/**` and `kernel/src/**`. Each file keeps its upstream
`SPDX-License-Identifier: MIT` + copyright header; files this port modified
carry an added "Ported to ISPO from …" line naming the upstream path, and every
substantive change is commented `ISPO PORT:` at the point of change.

Modified upstream files:

| File | Change |
|---|---|
| `kernel/src/save.ts` | rewritten below the serialization layer: decks are `fs` files, not self-rewriting HTML. `downloadFile` deleted (spec §25 build gate). |
| `kernel/src/autosave.ts` | IndexedDB backing store replaced with `fs` |
| `kernel/src/net.ts` | offline mode pinned on (the app declares no egress) |
| `kernel/src/update.ts` | signed self-update channel removed; version + offline re-exports kept |
| `slides/src/packs.ts` | downloadable language packs stubbed out (no egress, no shell to carry one) |
| `slides/src/main.ts` | boot is an exported function taking the document, not a module body |
| `slides/src/editor/editor.ts` | `alert`/`confirm`/`prompt` → in-frame dialogs; Open/New/Export added; update + offline switches locked |
| `slides/src/editor/panels.ts`, `comments.ts`, `canvas.ts` | `alert`/`confirm`/`prompt` → in-frame dialogs |

## Deliberately NOT carried over

- `slides/index.html`, `vite.config.ts`, `package-lock.json`, `probe/` — the
  host generates the HTML shell and builds with esbuild.
- `slides/src/i18n/packs/` — the 22 downloadable language catalogues. They are
  only reachable through the release channel this port drops, and nothing in
  the bundle imports them. The **nine built-in interface languages**
  (English + `i18n/packed.ts`: ja, zh-Hans, zh-Hant, es, fr, de, it, pt) are
  unaffected.
- `server/sync-worker/`, `home/`, `site-src/`, `scripts/`, `docs/`,
  `spaces/`, `dash/`, `type/`, `plugins/`, `.github/`, `.claude/`,
  `AGENTS.md`, `CLAUDE.md` — not part of the app.
- `node_modules/`, any `dist*/` — never committed.

## Third-party components inside the app

Vendored through `package.json` rather than copied: `reveal.js` (MIT),
`moveable` + `selecto` (MIT, © Daybrush), `temml` (MIT). Upstream's
`THIRD_PARTY_NOTICES.md` also covers the Fraunces and Instrument Sans
typefaces (OFL); those travel as document assets inside decks that use them,
not in this repo.
