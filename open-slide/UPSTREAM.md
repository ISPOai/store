# Where this came from

Open Slide started from [1weiho/open-slide](https://github.com/1weiho/open-slide)
(MIT, © 2026 Yiwei Ho), taken once as a starting point at commit
`663c9578aa00c1107a1b697f79d96ec0a6d471d6` (2026-08-24, `@open-slide/core` 1.19.1).

**This is not a fork and does not track upstream.** There is no submodule, no
subtree, no remote, and nothing here is meant to be merged from the original
again. The code has moved on independently since it was taken, and it will keep
moving. This file exists to satisfy the MIT attribution requirement and to say
plainly what the starting point was — not to describe a sync process.

## What was taken

Three pieces carry upstream logic, each with an attribution header naming its
source file:

| File | Upstream source |
| --- | --- |
| `src/components/slide-canvas.tsx` | `packages/core/src/app/components/slide-canvas.tsx` |
| `src/lib/design.ts` | `packages/core/src/app/lib/design.ts` |
| `src/lib/keys.ts` | `packages/core/src/app/lib/keys.ts` |

`src/components/player.tsx` follows upstream's navigation and present-mode
behaviour — step advance and retreat, blackout, jump-to-page — but is written
against this app's data model rather than copied.

Everything else is written for this host: the deck document, the block renderer,
the editor, the project commands, storage.

## What the port is not

Upstream is a framework whose runtime compiles each deck's `.tsx` through Vite.
The host builds one fixed entry with esbuild and has no per-deck compile step,
and a sandboxed project iframe cannot write its own source — so decks here are
documents rather than modules. That is what lets `create-deck` and the editor
panel exist, and it is why a page is a set of typed blocks rather than arbitrary
React.

The dev-server features (inspector, `@slide-comment` markers, agent socket,
folders/themes/assets endpoints) have nothing to talk to in a sealed iframe and
were not carried over. The presenter *window* cannot exist either; what it would
have shown — elapsed time, next page, speaker notes — is an in-frame overlay
instead (`P` while presenting).
