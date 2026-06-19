# ISPO Store

The curated app store for [ISPO](https://github.com/ISPOai) — the first-party catalog of
apps a user browses and installs into their own ISPO. This is the repo the host reads (spec §22).

## Layout

```
store/
├── catalog.json          # the curated index the host fetches to render the gallery
├── tip-calculator/       # one app = one top-level folder (the `subpath`)
│   ├── .ispo/project.json #   closed ISPO descriptor (schemaVersion 1)
│   ├── icon.svg          #   REQUIRED bundled app icon (svg/png/webp/jpg)
│   └── src/              #   app source; the host builds it (React provided by the host)
└── quote-shuffler/
    ├── .ispo/project.json
    ├── icon.svg
    └── src/
```

Each app is an ordinary ISPO project: a `.ispo/project.json` descriptor plus `src/`. Apps bring
**no** `package.json`/`node_modules` — the host provides React, `react-dom`, and `@ispo/sdk` at
build time (inline-v1).

**Every submitted app must bundle an icon** in its own folder (e.g. `icon.svg`) and name it in the
catalog entry's `icon` field. The icon ships with the app, so it travels on install and identifies
the app in the store gallery. Allowed: `.svg`, `.png`, `.webp`, `.jpg` (single filename, ≤128 KiB).
The host fetches it from the pinned store origin and inlines it as a `data:` URL for the gallery
(the host renderer's CSP forbids remote images), so the icon must live in the repo, not a CDN.

## How the host consumes this

1. The host fetches `catalog.json` from `raw.githubusercontent.com/ISPOai/store/<ref>/catalog.json`
   (origin-pinned, closed-schema, size-bounded — it is metadata only, it confers no authority).
2. On install, the host **sparse-clones only that app's folder** out of this repo
   (`git clone --depth=1 --filter=blob:none --sparse` + `git sparse-checkout set <subpath>`),
   discards the store's `.git`, and materializes the folder as its own project under `~/ISPO/`.
3. The app lands `origin:'imported'`, **quarantined**, with fresh receiver-side grants — same trust
   model as any imported repo. Curation does not auto-elevate trust.

## `catalog.json` schema

```jsonc
{
  "schemaVersion": 1,
  "apps": [
    {
      "id": "string",              // stable catalog id
      "name": "string",            // display name
      "description": "string",     // one-line summary
      "subpath": "string",         // top-level folder name, /^[a-z0-9][a-z0-9-]*$/
      "ref": "string?",            // optional git ref; defaults to the default branch
      "icon": "string",            // REQUIRED bundled icon filename in the app folder
                                   //   (svg/png/webp/jpg, single filename, ≤128 KiB)
      "capabilitySummary": "string?" // optional human summary of what the app asks for
    }
  ]
}
```

## Adding an app

1. Add a top-level folder named `[a-z0-9][a-z0-9-]*` containing `.ispo/project.json` + `src/`.
2. The app's browser entry must be one of `src/main.{tsx,jsx,ts,js}` (the host detects it).
3. Add a matching entry to `catalog.json`.
4. Keep `requests`/`egress` least-privilege — the gallery surfaces them as the capability summary.
