# Third-Party Notices

## earthtojake/text-to-cad

- Repository: https://github.com/earthtojake/text-to-cad
- Pinned revision: `fdbb4b4fb62d95ae298cfe9a46fdc7092bdaf423`
- License: MIT

The following upstream material is included under `vendor/text-to-cad/`:

- the STEP and inspection runtime adapted under `cad-runtime/`
- `packages/cadjs/`
- `viewer/src/server/step/`
- `viewer/src/server/catalog/`
- `viewer/src/client/components/viewer/orbitControls.js`
- `viewer/src/client/components/viewer/orbitControls.test.js`
- `viewer/src/client/components/viewer/renderState.js`
- `viewer/src/client/components/viewer/renderState.test.js`
- `viewer/src/client/components/viewer/hooks/viewerContextMenuGesture.js`
- `LICENSE`

The upstream skill wrapper and agent metadata are not shipped. The app-owned
worker protocols call only the vendored STEP and inspection runtime. The
upstream browser-automation snapshot runner is also omitted; the CAD app
captures review images from its embedded viewer instead.

ISPO-specific runtime guards, API handlers, React components, data services,
commands, and agent-task wrappers are maintained outside the vendor tree.
