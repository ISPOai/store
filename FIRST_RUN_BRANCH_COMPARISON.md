# First-run branch comparison and combined review handoff

This document compares the two first-run implementations and records the decisions made in the combined branch. It is intended as a review handoff for Claude and any later reviewer.

## Compared revisions

- Baseline: `main` at `bcc4f56` (`Replace Music with Excalidraw`)
- Claude: `first-run-with-claude` at `16b469e`
- Codex: `codex/first-run-with-codex` at `93a4335` before this integration

Both branches independently made all three Store apps installable under the current ISPO host. They solved the same initial admission and dependency problems in different ways, then the Codex run uncovered additional Files integration failures while exercising the installed apps.

## What the Claude branch did better

### Meaningful project commands

Claude added useful, durable-data commands with precise input and result schemas:

- Excalidraw `create-scene` creates a real `.excalidraw` file from labels.
- Moodboard `list-board` reads the persisted board document.
- OpenCut `list-video-projects` reads persisted project documents.

These commands are materially better than the original Codex focus-only commands. They are callable without depending on mounted React state, use the invocation-scoped SDK from the command context, and give an agent useful application behavior.

### Conservative Excalidraw lockfile migration

Claude converted the pnpm v6 lockfile to v9 while preserving dependency selections. The original Codex regeneration also produced a valid v9 lockfile, but moved multiple transitive versions allowed by semver ranges. The combined branch therefore keeps Claude's lower-churn lockfile.

## What the Codex branch did better

### Files picker result handling

The SDK can return a single pick or an array. A pick can contain a private project `path` or a controlled `url`. The Claude branch retained the old assumption that `picked.path` always existed, which caused the observed runtime error `path must be a string` for controlled URL results.

The combined branch keeps the Codex normalization in:

- `moodboard/src/components/canvas-board.tsx`
- `opencut/src/components/editor/panels/assets/views/assets.tsx`

Both paths now read a private path through `fs.readBinary`, fetch a controlled URL when present, and reject malformed picker results.

### OpenCut save cancellation

Claude's save helpers returned `false` on cancellation, but their callers ignored that value. Video export cleared its completed buffer and closed the export UI, while snapshot save returned `{ success: true }` even though no file was created.

The combined branch keeps the Codex behavior:

- video export retains its export state on cancellation so the user can retry;
- snapshot save reports `Save cancelled` instead of a false success.

### Reproducible workspace linking

The combined branch retains `link-workspace-packages=true` in `excalidraw/.npmrc`. Claude's committed lockfile installs correctly without it, but the setting prevents a future pnpm 10 lockfile regeneration from resolving local `@excalidraw/*` packages against the public registry.

## Problems found during comparison

### Claude branch

1. Moodboard and OpenCut still failed Files attachments for controlled URL results.
2. OpenCut reported canceled saves as successful or discarded a reusable export buffer.
3. Moodboard and OpenCut command handlers converted every storage exception into empty data. Permission, transport, and corruption errors could therefore be misreported to an agent as an empty board/project list.
4. OpenCut's local `@ispo/sdk` declaration added `files.save` but omitted `files.pick`, even though the application calls it. A focused TypeScript check reproduced `Property 'pick' does not exist`.
5. OpenCut's date sort comparator returned `-1` for equal timestamps instead of `0`.

### Original Codex branch

1. The focus-only commands satisfied admission but were weak agent-facing use cases and used broad result schemas.
2. Its pnpm 10 lockfile regeneration moved transitive dependency versions unnecessarily.
3. It imported new `files` and `commands` SDK exports without updating OpenCut's local SDK declaration.

## Combined implementation decisions

The combined branch now:

- uses Claude's three meaningful command designs and strict schemas;
- keeps Claude's conservative Excalidraw v9 lockfile;
- keeps Codex's Files path/URL/array attachment normalization;
- keeps Codex's save-cancellation semantics;
- keeps `link-workspace-packages=true` for future lockfile regeneration;
- propagates command storage failures unless the error is the expected missing file/directory case;
- uses a comparator that correctly returns equality for equal timestamps;
- expands OpenCut's standalone SDK declaration to include the picker union, save result, scoped command context, and typed command generics without `any`;
- avoids appending a second `.excalidraw` extension and aligns the command save filter with the existing Excalidraw export path.

## Requested Claude follow-up review

Please review the combined branch with particular attention to:

1. whether the three command schemas exactly match every returned envelope;
2. whether each command remains compatible with the project-command extraction/effect analysis;
3. whether missing-data detection is narrow enough without hiding permission or transport errors;
4. whether OpenCut's local SDK declaration matches the runtime surface used by the app;
5. whether Files save cancellation should remain a retryable UI state for video export;
6. whether the controlled URL attachment path should stream directly anywhere rather than materializing a `Blob`;
7. whether Claude's lockfile plus `link-workspace-packages=true` remains the smallest reproducible dependency change.

## Validation record

- Claude's Excalidraw lockfile was independently accepted by pnpm 10.6.5 using a frozen, offline, lockfile-only install.
- The original Codex branch installed and rendered OpenCut, Moodboard, and Excalidraw in ISPO.
- The original Codex attachment bundles were confirmed live for OpenCut and Moodboard.
- The final combined lockfile passed the same frozen pnpm 10.6.5 check with `link-workspace-packages=true` enabled.
- ISPO's production command analyzer extracted exactly `create-scene`, `list-board`, and `list-video-projects` with no diagnostics.
- Focused TypeScript checks passed for OpenCut's command implementation, scoped SDK types, and `files.pick` surface.
- The staged Store diff passed its whitespace/conflict-marker checks.
