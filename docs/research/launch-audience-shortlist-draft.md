# Provisional launch-audience shortlist

**Status:** draft; separated from the main landscape because the audience selection and ranking are not approved.

This document is a working interpretation of the broader [open-source app landscape](./open-source-app-landscape.md). It should not be treated as the final launch strategy.

## Selection criteria used in this draft

The shortlist is intentionally narrower than the full research catalog. An app counts toward an easy-to-support audience only when it:

1. already provides a complete browser user interface;
2. can be self-hosted without a mandatory application server or database;
3. needs packaging and SDK integration, not a new product UI;
4. uses a permissive license, or is an existing Store app that has already been reviewed; and
5. has no obvious asset, model, trademark, or dependency issue that blocks redistribution.

For conservative planning, MIT, Apache-2.0, and BSD projects are the default green zone. MPL projects require a file-level compliance plan. GPL and AGPL projects do not count as easy integrations until counsel approves the exact distribution and linking model. This is a product-screening rule, not legal advice.

## Proposed primary launch audiences

| Priority | Audience | Ready app workflow | Why it is easy to support | Remaining boundary |
|---|---|---|---|---|
| **1** | **Brand and social-content creators** | Moodboard → Excalidraw → [miniPaint](https://github.com/viliusle/miniPaint) / [JS Paint](https://github.com/1j01/jspaint) / [BitMappery](https://github.com/igorski/bitmappery) → [SVG-Edit](https://github.com/SVG-Edit/svgedit) → OpenCut/OpenSlides | The creation tools are complete browser apps under MIT; the rest already exist in the Store. This covers references, sketches, raster/vector assets, short videos, and presentations. | Social publishing, scheduling, channel analytics, and a dedicated brand-kit/template manager are still missing. |
| **2** | **Diagram and presentation creators** | Excalidraw → [Mermaid Live Editor](https://github.com/mermaid-js/mermaid-live-editor) → SVG-Edit/miniPaint → OpenSlides; optionally [draw.io](https://github.com/jgraph/drawio) | Mermaid Live Editor is a complete MIT browser app, so text-to-diagram no longer requires ISPO to build a UI. The rest of the core path is existing or browser-complete. | Data-driven chart authoring is still library-based; draw.io remains conditional on asset and trademark review. |
| **3** | **Pixel-art and game-asset creators** | Moodboard/Excalidraw → [Piskel](https://github.com/piskelapp/piskel) / [BitMappery](https://github.com/igorski/bitmappery) → [BeepBox](https://github.com/johnnesky/beepbox) / [Efflux](https://github.com/igorski/efflux-tracker) → miniPaint → OpenCut | The ready apps cover sprites, spritesheets, animation, music/loops, supporting artwork, and trailers with MIT or Apache-2.0 licenses. | There is still no easy permissive bundle for complete game assembly, 3D asset creation, level editing, or team asset/version management. |
| **4** | **Parametric 3D-print creators** | Excalidraw → [JSCAD](https://github.com/jscad/OpenJSCAD.org) → [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) → [Kiri:Moto/Mesh:Tool](https://github.com/GridSpace/grid-apps) → miniPaint/OpenSlides | The newly identified MIT apps add multi-format inspection, mesh repair, slicing, and G-code generation. Kiri:Moto also documents an iframe messaging API. | Packaging, workers, CSP, and the iframe API still require prototypes; general-purpose sculpting and printer-fleet management are outside the workflow. |
| **5** | **Podcasters and audio-clip producers** | [AudioMass](https://github.com/pkalogiros/AudioMass) → [BeepBox](https://github.com/johnnesky/beepbox) / [Efflux](https://github.com/igorski/efflux-tracker) → miniPaint → OpenCut | Recording, multitrack editing, music, artwork, and promotional clips are covered by complete MIT browser apps. | This is a **second-wave audience**: mature script/show-note authoring, automatic transcription/caption correction, RSS hosting, distribution, and analytics remain missing. |

## Missing ready software for the proposed audiences

| Selected audience | What ready apps cover | Missing ready software | Honest launch scope |
|---|---|---|---|
| **Brand and social-content creators** | Visual direction, drawing, raster/vector editing, short-video editing, presentations | Social publishing/scheduling, channel analytics, brand-kit and reusable-template management | Launch as a **content-production studio**, not a social-media operations suite. |
| **Diagram and presentation creators** | Freehand diagrams, text-to-diagram, vector/raster assets, slide authoring | Complete spreadsheet/chart authoring from data; draw.io still needs asset/trademark clearance | Launch as a **diagram-to-deck studio**; exclude BI and advanced data presentations. |
| **Pixel-art and game-asset creators** | Sprites, spritesheets, animation, music/loops, artwork, trailers | Full game editor, permissive ready 3D editor, level editor, shared asset library/versioning | Launch as a **2D game-asset studio**, not an indie-game development studio. |
| **Parametric 3D-print creators** | Scripted models, format inspection/conversion, mesh repair, slicing, G-code | General-purpose modeling/sculpting, printer control/fleet management; integration prototypes are not yet complete | Candidate for launch **after JSCAD, Online 3D Viewer, and Kiri:Moto prototypes pass**. |
| **Podcasters and audio-clip producers** | Recording, waveform/multitrack editing, music, cover artwork, promotional video | Mature ready script/show-note editor, transcription/caption editor, podcast RSS hosting/distribution/analytics | Do **not** call this end-to-end yet; launch only as an **audio-production and promo studio**. |

## Ready-app license gate used in this draft

| App | Readiness | License posture | Draft decision |
|---|---|---|---|
| [miniPaint](https://github.com/viliusle/miniPaint) | Complete browser image editor with documented iframe embedding | MIT | **GREEN** |
| [SVG-Edit](https://github.com/SVG-Edit/svgedit) | Complete browser vector editor | MIT | **GREEN** |
| [AudioMass](https://github.com/pkalogiros/AudioMass) | Complete browser audio recorder/editor | MIT for original code; retain and audit third-party notices | **GREEN WITH NOTICE AUDIT** |
| [Piskel](https://github.com/piskelapp/piskel) | Complete browser sprite editor with offline builds | Apache-2.0 | **GREEN**; confirm maintenance and browser behavior during integration. |
| [BeepBox](https://github.com/johnnesky/beepbox) | Complete TypeScript browser music editor | MIT | **GREEN WITH DEPENDENCY AUDIT**; vendor or review the optional MP3-export dependency. |
| [JS Paint](https://github.com/1j01/jspaint) | Complete browser paint application | MIT | **GREEN WITH EGRESS REVIEW**; disable or remove third-party upload features. |
| [BitMappery](https://github.com/igorski/bitmappery) | Complete browser editor with layers, masking, animation, and spritesheets | MIT | **GREEN WITH STORAGE REVIEW**; retain local mode and disable unneeded cloud integration. |
| [Efflux](https://github.com/igorski/efflux-tracker) | Complete browser music tracker/DAW with MIDI | MIT | **GREEN WITH STORAGE REVIEW**; prototype local-only project persistence. |
| [Mermaid Live Editor](https://github.com/mermaid-js/mermaid-live-editor) | Complete Svelte browser diagram editor | MIT | **GREEN WITH EGRESS REVIEW**; disable external renderer, sharing, analytics, and promotional endpoints. |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | Self-hostable browser UI | MIT unless a subcomponent states otherwise | **GREEN AFTER PACKAGING PROTOTYPE** |
| [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) | Complete browser model viewer, converter, and explorer | MIT | **GREEN WITH DEPENDENCY AUDIT**; test workers, large files, and format-loader licenses. |
| [Kiri:Moto/Mesh:Tool](https://github.com/GridSpace/grid-apps) | Complete browser slicer and mesh-repair apps with iframe messaging API | MIT | **GREEN AFTER PACKAGING PROTOTYPE**; test workers, CSP, export, and frame messaging. |
| [draw.io](https://github.com/jgraph/drawio) | Complete client-side browser editor | Apache-2.0 code; separate stencil, template, icon, and trademark terms | **YELLOW**; legal/asset review before Store inclusion. |
| Blockbench, Twine, GridSound | Complete or substantial browser apps | GPL-3.0 or AGPL-3.0 | **NOT IN EASY-INTEGRATION SHORTLIST** pending distribution review. |
| GDevelop, Pixelorama, Slidev, Motion Canvas | Browser-capable projects | Permissive licenses, but heavy integration/build assumptions | **NOT IN EASY-INTEGRATION SHORTLIST** because they are not simple packaging jobs. |
| Editor.js, Mermaid, DuckDB-Wasm, Perspective, Transformers.js, and other foundations | Libraries or engines rather than complete Store apps | Mostly permissive | **NOT IN EASY-INTEGRATION SHORTLIST** because ISPO must build the missing application UI. |

## Audiences proposed for deferral

- **Full game developers:** the easy, permissively licensed apps cover asset creation, not a complete game-authoring workflow.
- **Online-course producers:** the useful foundations are strong, but script authoring, AI generation, captions, publishing, and LMS delivery are not all ready-app integrations.
- **Researchers and data teams:** most of the data stack is a collection of libraries that still needs custom product UI.
- **Viral AI video agencies:** image/video generation depends on Python/GPU backends, so the central production stage is not a current Store app.
- **Office, sales, consulting, and product teams:** their critical systems of record, project management, scheduling, signatures, and portals require backend products or new apps.
