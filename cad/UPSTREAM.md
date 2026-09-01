# Upstream provenance

CAD is an ISPO application built around selected code from
[earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad).

- Upstream revision: `fdbb4b4fb62d95ae298cfe9a46fdc7092bdaf423`
- License: MIT
- Copyright: Copyright (c) 2026 earthtojake

## Included upstream material

- `vendor/text-to-cad/packages/cadjs/` provides the embedded CAD viewer.
- `vendor/text-to-cad/cad-runtime/` adapts the STEP generation and inspection
  runtime without shipping the upstream skill or agent metadata.
- Selected viewer server and client modules support catalog scanning, STEP
  compilation, orbit controls, and render state.

## Deliberately omitted

- Upstream agent metadata and skill packaging.
- The Playwright snapshot runner; CAD captures snapshots from its embedded
  viewer without browser automation.
- Upstream development servers, repository automation, and unrelated packages.

ISPO-specific UI, entity state, Files integration, agent dispatch, runtime
boundaries, commands, and worker protocols are maintained by ISPO.
