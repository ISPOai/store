# Working in this repo

This is the curated app store for ISPO: one top-level folder per app plus
`catalog.json`. Read `README.md` for the catalog schema and layout.

**The main goal:** every implementation is a probe of the host — during
implementation and verification we must figure out what bugs the host
application has, record them as Host findings in the PR, and afterwards ask
what the implementation taught and fold it back into the guide (Phase 7).
Shipping the app is the output; the findings and the improved guide are the
point.

**Adding or porting an app? Follow `docs/adding-an-app.md` end to end.** It is
the required pipeline — upstream review, the permission-envelope decision,
the build gates that will otherwise fail your install, and a mandatory
self-validation phase against a running host, ending in a handoff report for
the human validator. One branch and one PR per app, on a branch namespaced
by the implementing agent — `claude/<topic>` or `codex/<topic>` — and the PR
description carries the report.

House rules that trip people up (details and rationale in the guide):

- Apps are boilerplate **taken once** from upstream at a recorded SHA — no
  submodules, no tracking. Record provenance in `<app>/UPSTREAM.md`.
- Every app must export a code-first command catalog; store installs build
  with `requireProjectCommands` on.
- No `<a download>` exits; artifacts leave through Files/Assets.
- Keep `requests` least-privilege and justified; `shared` is not a request
  key; don't copy another app's `connectors` block.
- Icons are raster only, ≤128 KiB, magic bytes matching the extension.
- Never commit `node_modules/` or `dist/`.
- Validation is not "it compiles": install through the real store path on a
  live host and drive the app before opening the PR.
- Stand up the unmodified upstream app under `.reference/` (gitignored) at the
  SHA recorded in `UPSTREAM.md`, and include a behaviour parity table in the
  PR — the human validator compares the port against the original directly.
