# Browser-compatible open-source app landscape for the ISPO Store

**Runtime-cleaned:** 2026-08-28  
**Scope:** applications that can become current ISPO Store iframe projects, plus named gaps showing which desirable native/server products cannot.

## Executive conclusion

The current Store cannot place an unchanged desktop window or a general server product inside an iframe. A usable Store app must end as a browser application with one of these entries:

- `src/main.tsx`
- `src/main.jsx`
- `src/main.ts`
- `src/main.js`

Its visible interface must run in HTML/CSS and JavaScript/TypeScript. A maintained browser WebAssembly package is possible when it already has a JavaScript bridge. WebAssembly does not turn a Qt, GTK, Godot desktop, .NET, Java, or other native GUI into a browser UI.

This report therefore uses two explicit result types:

- **USE:** a browser-native app or JS/TS component that can become an ISPO app.
- **Gap:** use a named inline placeholder only inside a workflow chain when no current browser-compatible app fills that step.

Keeping the names in the gap rows is intentional. It shows investors and product planners the quality bar the missing browser app would need to match.

## Strict launch shortlist: easiest audiences to support

The launch shortlist is intentionally narrower than the full research catalog. An app counts toward an easy-to-support audience only when it:

1. already provides a complete browser user interface;
2. can be self-hosted without a mandatory application server or database;
3. needs packaging and SDK integration, not a new product UI;
4. uses a permissive license, or is an existing Store app that has already been reviewed; and
5. has no obvious asset, model, trademark, or dependency issue that blocks redistribution.

For conservative planning, MIT, Apache-2.0, and BSD projects are the default green zone. MPL projects require a file-level compliance plan. GPL and AGPL projects do not count as easy integrations until counsel approves the exact distribution and linking model. This is a product-screening rule, not legal advice.

### Primary launch audiences

| Priority | Audience | Ready app workflow | Why it is easy to support | Remaining boundary |
|---|---|---|---|---|
| **1** | **Brand and social-content creators** | Moodboard → Excalidraw → [miniPaint](https://github.com/viliusle/miniPaint) / [JS Paint](https://github.com/1j01/jspaint) / [BitMappery](https://github.com/igorski/bitmappery) → [SVG-Edit](https://github.com/SVG-Edit/svgedit) → OpenCut/OpenSlides | The creation tools are complete browser apps under MIT; the rest already exist in the Store. This covers references, sketches, raster/vector assets, short videos, and presentations. | Social publishing, scheduling, channel analytics, and a dedicated brand-kit/template manager are still missing. |
| **2** | **Diagram and presentation creators** | Excalidraw → [Mermaid Live Editor](https://github.com/mermaid-js/mermaid-live-editor) → SVG-Edit/miniPaint → OpenSlides; optionally [draw.io](https://github.com/jgraph/drawio) | Mermaid Live Editor is a complete MIT browser app, so text-to-diagram no longer requires ISPO to build a UI. The rest of the core path is existing or browser-complete. | Data-driven chart authoring is still library-based; draw.io remains conditional on asset and trademark review. |
| **3** | **Pixel-art and game-asset creators** | Moodboard/Excalidraw → [Piskel](https://github.com/piskelapp/piskel) / [BitMappery](https://github.com/igorski/bitmappery) → [BeepBox](https://github.com/johnnesky/beepbox) / [Efflux](https://github.com/igorski/efflux-tracker) → miniPaint → OpenCut | The ready apps cover sprites, spritesheets, animation, music/loops, supporting artwork, and trailers with MIT or Apache-2.0 licenses. | There is still no easy permissive bundle for complete game assembly, 3D asset creation, level editing, or team asset/version management. |
| **4** | **Parametric 3D-print creators** | Excalidraw → [JSCAD](https://github.com/jscad/OpenJSCAD.org) → [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) → [Kiri:Moto/Mesh:Tool](https://github.com/GridSpace/grid-apps) → miniPaint/OpenSlides | The newly identified MIT apps add multi-format inspection, mesh repair, slicing, and G-code generation. Kiri:Moto also documents an iframe messaging API. | Packaging, workers, CSP, and the iframe API still require prototypes; general-purpose sculpting and printer-fleet management are outside the workflow. |
| **5** | **Podcasters and audio-clip producers** | [AudioMass](https://github.com/pkalogiros/AudioMass) → [BeepBox](https://github.com/johnnesky/beepbox) / [Efflux](https://github.com/igorski/efflux-tracker) → miniPaint → OpenCut | Recording, multitrack editing, music, artwork, and promotional clips are covered by complete MIT browser apps. | This is a **second-wave audience**: mature script/show-note authoring, automatic transcription/caption correction, RSS hosting, distribution, and analytics remain missing. |

### Missing ready software for the selected audiences

| Selected audience | What ready apps cover | Missing ready software | Honest launch scope |
|---|---|---|---|
| **Brand and social-content creators** | Visual direction, drawing, raster/vector editing, short-video editing, presentations | Social publishing/scheduling, channel analytics, brand-kit and reusable-template management | Launch as a **content-production studio**, not a social-media operations suite. |
| **Diagram and presentation creators** | Freehand diagrams, text-to-diagram, vector/raster assets, slide authoring | Complete spreadsheet/chart authoring from data; draw.io still needs asset/trademark clearance | Launch as a **diagram-to-deck studio**; exclude BI and advanced data presentations. |
| **Pixel-art and game-asset creators** | Sprites, spritesheets, animation, music/loops, artwork, trailers | Full game editor, permissive ready 3D editor, level editor, shared asset library/versioning | Launch as a **2D game-asset studio**, not an indie-game development studio. |
| **Parametric 3D-print creators** | Scripted models, format inspection/conversion, mesh repair, slicing, G-code | General-purpose modeling/sculpting, printer control/fleet management; integration prototypes are not yet complete | Candidate for launch **after JSCAD, Online 3D Viewer, and Kiri:Moto prototypes pass**. |
| **Podcasters and audio-clip producers** | Recording, waveform/multitrack editing, music, cover artwork, promotional video | Mature ready script/show-note editor, transcription/caption editor, podcast RSS hosting/distribution/analytics | Do **not** call this end-to-end yet; launch only as an **audio-production and promo studio**. |

### Ready-app license gate

| App | Readiness | License posture | Launch decision |
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

### Audiences to defer

- **Full game developers:** the easy, permissively licensed apps cover asset creation, not a complete game-authoring workflow.
- **Online-course producers:** the useful foundations are strong, but script authoring, AI generation, captions, publishing, and LMS delivery are not all ready-app integrations.
- **Researchers and data teams:** most of the data stack is a collection of libraries that still needs custom product UI.
- **Viral AI video agencies:** image/video generation depends on Python/GPU backends, so the central production stage is not a current Store app.
- **Office, sales, consulting, and product teams:** their critical systems of record, project management, scheduling, signatures, and portals require backend products or new apps.

## Runtime boundary

```text
CURRENT STORE APP
  HTML/CSS + JavaScript/TypeScript UI
  src/main.tsx | jsx | ts | js
  optional browser Worker/Wasm package with maintained JS bridge
                    │
                    └── @ispo/sdk / postMessage → host

NOT A CURRENT STORE APP
  unchanged native desktop GUI
  Docker container presented as an iframe
  mandatory persistent backend/database product
  generalized native sidecar or remote-desktop surface
```

The relevant sources are [`import-repo.ts`](https://github.com/ISPOai/ispo/blob/main/apps/desktop/src/main/projects/import-repo.ts) in the host repository and the local [ISPO Store README](../../README.md).

## Eligibility labels

| Label | Meaning |
|---|---|
| **READY** | Existing browser application; adaptation is mainly SDK, shared files, CSP, and packaging. |
| **BUILD UI** | Useful JS/TS library or engine; an ISPO-specific mini-app must be built around it. |
| **HEAVY ADAPTATION** | A browser distribution exists, but integration and build assumptions require a prototype. |
| **INLINE GAP** | Named placeholder used only inside a workflow chain when no current Store app fills the step. |

## Best usable projects after cleanup

### Complete or nearly complete browser applications

| Project | Capability | Browser technology | License | Result |
|---|---|---|---|---|
| [AudioMass](https://github.com/pkalogiros/AudioMass) | Audio/waveform editing | JavaScript, Web Audio | MIT | **READY** |
| [miniPaint](https://github.com/viliusle/miniPaint) | Layered raster image editing | JavaScript, Canvas | MIT | **READY** |
| [JS Paint](https://github.com/1j01/jspaint) | Lightweight painting and image editing | JavaScript, Canvas | MIT | **READY**; remove or disable third-party upload actions. |
| [BitMappery](https://github.com/igorski/bitmappery) | Layered image, animation, and spritesheet editing | TypeScript/Vue, Canvas | MIT | **READY / REVIEW**; test local-only storage. |
| [SVG-Edit](https://github.com/SVG-Edit/svgedit) | Vector editing | JavaScript, SVG | MIT | **READY** |
| [draw.io](https://github.com/jgraph/drawio) | Diagrams and whiteboards | JavaScript | Apache-2.0 code | **READY**; review stencil and trademark terms. |
| [Mermaid Live Editor](https://github.com/mermaid-js/mermaid-live-editor) | Text-to-diagram editing and preview | TypeScript/Svelte | MIT | **READY / REVIEW**; build with external renderers, analytics, and promotions disabled. |
| [Piskel](https://github.com/piskelapp/piskel) | Sprites and pixel art | JavaScript | Apache-2.0 | **READY** |
| [Blockbench](https://github.com/JannisX11/blockbench) | Low-poly 3D models | JavaScript, WebGL | GPL-3.0 | **READY** |
| [Twine](https://github.com/klembot/twinejs) | Branching interactive stories | TypeScript | GPL-3.0 | **READY** |
| [BeepBox](https://github.com/johnnesky/beepbox) | Music sketching | TypeScript, Web Audio | MIT | **READY** |
| [Efflux](https://github.com/igorski/efflux-tracker) | Browser music tracker/DAW | TypeScript/Vue, Web Audio/Web MIDI | MIT | **READY / REVIEW**; retain local-only project storage. |
| [GridSound](https://github.com/gridsound/daw) | Browser DAW | JavaScript, Web Audio | AGPL-3.0 | **HEAVY ADAPTATION**; audit its “half open-source” statement, assets, and submodules. |
| [Starboard Notebook](https://github.com/gzuidhof/starboard-notebook) | Browser notebook | TypeScript | MPL-2.0 | **READY / REVIEW** |
| [GDevelop](https://github.com/4ian/GDevelop) | No-code game editor | React/JavaScript UI with browser-compiled core | MIT | **HEAVY ADAPTATION**; keep only if its browser distribution can be sealed and bridged. |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | Pixel art and animation | Existing Godot web export with JS/Wasm loader | MIT | **HEAVY ADAPTATION**; canvas-level integration, not DOM-native. Piskel is the safer first choice. |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | Scripted parametric CAD | JavaScript, WebGL | MIT | **READY / ADAPT** |
| [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) | 3D model viewing, inspection, and conversion | JavaScript/WebGL | MIT | **READY / REVIEW**; audit format-loader dependencies and workers. |
| [Kiri:Moto/Mesh:Tool](https://github.com/GridSpace/grid-apps) | 3D slicing, mesh repair, CAM, and laser preparation | JavaScript, Web Workers/WebGL | MIT | **READY / ADAPT**; iframe API exists, but packaging and CSP need a prototype. |

### JS/TS foundations that need a custom ISPO app

| Project | App to build | Browser technology | License | Result |
|---|---|---|---|---|
| [Editor.js](https://github.com/codex-team/editor.js) | Structured script/document editor | TypeScript | Apache-2.0 | **BUILD UI** |
| [Lexical](https://github.com/facebook/lexical) | General rich-text editor | TypeScript | MIT | **BUILD UI** |
| [BlockNote](https://github.com/TypeCellOS/BlockNote) | Notion-like document editor | TypeScript/React | MPL-2.0 core | **BUILD UI**; exclude XL packages unless separately cleared. |
| [Mermaid](https://github.com/mermaid-js/mermaid) | Text-to-diagram editor | TypeScript | MIT | **BUILD UI** |
| [Reveal.js](https://github.com/hakimel/reveal.js) | Presentation preview/export | JavaScript | MIT | **BUILD UI** |
| [Slidev](https://github.com/slidevjs/slidev) | Markdown presentation editor | TypeScript/Vue | MIT | **HEAVY ADAPTATION** |
| [Marp](https://github.com/marp-team/marp) | Markdown slide renderer | TypeScript | MIT | **BUILD UI** |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | Code-backed motion graphics | TypeScript | MIT | **HEAVY ADAPTATION** |
| [Babylon.js](https://github.com/BabylonJS/Babylon.js) | 3D scene composer | TypeScript/WebGL/WebGPU | Apache-2.0 | **BUILD UI** |
| [Three.js](https://github.com/mrdoob/three.js) | 3D viewer/editor | JavaScript/WebGL/WebGPU | MIT | **BUILD UI** |
| [Phaser](https://github.com/phaserjs/phaser) | Lightweight 2D game builder | JavaScript | MIT | **BUILD UI** |
| [PixiJS](https://github.com/pixijs/pixijs) | 2D scene/animation builder | TypeScript | MIT | **BUILD UI** |
| [PlayCanvas Engine](https://github.com/playcanvas/engine) | Browser 3D/game builder | JavaScript/WebGL/WebGPU | MIT | **BUILD UI**; hosted editor/services are separate. |
| [Univer](https://github.com/dream-num/univer) | Spreadsheet/document app | TypeScript | Apache-2.0 core | **BUILD UI**; several import/export, chart, pivot, and collaboration features are Pro. |
| [JSON Forms](https://github.com/eclipsesource/jsonforms) | Form and survey builder | TypeScript/React | MIT | **BUILD UI** |
| [DuckDB-Wasm](https://github.com/duckdb/duckdb-wasm) | Local SQL/data explorer | TypeScript API plus browser Wasm | MIT | **BUILD UI** |
| [Perspective](https://github.com/perspective-dev/perspective) | Interactive table/chart explorer | TypeScript UI plus browser Wasm | Apache-2.0 | **BUILD UI** |
| [Vega-Lite](https://github.com/vega/vega-lite) | Declarative chart editor | TypeScript | BSD-3-Clause | **BUILD UI** |
| [kepler.gl](https://github.com/keplergl/kepler.gl) | Geospatial explorer | TypeScript/React/WebGL | MIT | **BUILD UI** |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Local transcription/TTS/AI utilities | JavaScript/TypeScript browser inference | Apache-2.0 | **BUILD UI**; model licenses and hardware requirements are separate. |
| [PDF.js](https://github.com/mozilla/pdf.js) | PDF viewer/annotation surface | JavaScript | Apache-2.0 | **BUILD UI** |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | PDF assembly/modification | TypeScript | MIT | **BUILD UI**; not a complete e-signature service. |

### Existing apps retained

- **Excalidraw** — sketches, wireframes, and diagrams.
- **Moodboard** — visual references and style direction.
- **OpenCut** — browser video editing.
- **OpenSlides** — presentation authoring.

## Role-driven workflow examples with inline gaps

Each stage states who does the work, what they do, and which app they use. The resulting artifact becomes shared context for the next stage. Gap markers appear only where no current Store app can perform the task.

| User group / studio | Example handoff workflow |
|---|---|
| **Course Studio** | **Instructional designer:** drafts the lesson, quiz, and narration script in Editor.js → **Learning designer:** turns concepts into diagrams with Mermaid and arranges references in Moodboard → **AI illustrator:** uses `[GAP - NO JS APP - InvokeAI/ComfyUI image generation]` to produce scene-consistent key art from the approved lesson and style board → **Illustrator:** corrects and finishes lesson graphics in miniPaint → **Voice producer:** records and cleans narration in AudioMass → **Video editor:** combines narration, images, and screen media in OpenCut → **Accessibility editor:** produces and corrects captions with Transformers.js → **Presenter:** creates supporting slides in OpenSlides → **Publisher:** uses `[GAP - NO JS APP - MediaCMS/PeerTube publishing]` to upload releases, organize episodes, and expose playback pages → **Course administrator:** uses `[GAP - NO JS APP - Moodle/Open edX learner management]` to enroll learners, assign lessons, and track completion and quiz results. |
| **Game Studio** | **Creative director:** defines the visual direction in Moodboard and Excalidraw → **Pixel artist:** creates sprites and animations in Piskel or Pixelorama → **3D artist:** creates low-poly assets in Blockbench → **Narrative designer:** writes branching dialogue in Twine → **Composer:** sketches music in BeepBox or GridSound → **Game designer:** assembles mechanics and levels in GDevelop, or in a custom Phaser/PlayCanvas builder → **Marketing editor:** cuts the trailer in OpenCut. |
| **Campaign Studio** | **Campaign strategist:** writes the brief, audience, and copy in Editor.js → **Art director:** collects references in Moodboard → **Designer:** creates static assets in miniPaint and SVG-Edit → **Video producer:** creates campaign clips in OpenCut → **Researcher:** designs the questionnaire in JSON Forms → **Survey operator:** uses `[GAP - NO JS APP - Formbricks hosted responses]` to publish the form, collect submissions, and monitor response quality → **Operations specialist:** organizes leads and budget in Univer → **Analyst:** measures results in Perspective or Vega-Lite → **Sales owner:** uses `[GAP - NO JS APP - Twenty CRM]` to convert responses into leads, assign owners, and track follow-ups → **Coordinator:** uses `[GAP - NO JS APP - Cal.com scheduling]` to offer booking slots and route meetings to the right team member → **Campaign lead:** presents results in OpenSlides. |
| **Research Studio** | **Researcher:** writes hypotheses and executable notes in Starboard Notebook → **Data engineer:** loads files and queries local data with DuckDB-Wasm → **Analyst:** inspects and cleans tables in Univer → **Visualization specialist:** creates interactive charts in Perspective or Vega-Lite and maps in kepler.gl → **Knowledge architect:** documents relationships with Mermaid → **Research lead:** presents findings in OpenSlides → **BI publisher:** uses `[GAP - NO JS APP - Superset/Metabase shared dashboards]` to publish governed dashboards, control access, and refresh team metrics from shared data. |
| **Video Creator Studio** | **Camera or screen presenter:** uses `[GAP - NO JS APP - OBS Studio/Cap recording]` to capture the screen, camera, microphone, and scene changes as source footage → **Audio editor:** cleans dialogue in AudioMass → **Video editor:** assembles the timeline in OpenCut → **Accessibility editor:** transcribes speech and prepares captions with Transformers.js → **Thumbnail designer:** creates the cover image in miniPaint → **Publisher:** uses `[GAP - NO JS APP - PeerTube/MediaCMS/Owncast hosting]` to upload the final video, schedule its release, expose playback, and manage the channel library. |
| **Viral AI Video Studio** | **Producer:** defines the audience, format, schedule, and approval criteria in Editor.js → **Trend strategist:** collects reference clips, hooks, and visual patterns in Moodboard → **Scriptwriter:** writes the hook, scenes, dialogue, and calls to action in Editor.js or BlockNote → **Storyboard artist:** turns the script into numbered shots with Excalidraw and Mermaid → **AI art director:** uses `[GAP - NO JS APP - ComfyUI/InvokeAI keyframe generation]` to generate style-consistent keyframes for every approved shot ID → **AI video artist:** uses `[GAP - NO JS APP - ComfyUI/Wan2.2 video generation]` to turn prompts and keyframes into candidate clips and attach them to the shot list → **Character animator:** uses `[GAP - NO JS APP - LivePortrait avatar animation]` to animate a recurring presenter from the approved portrait and performance track → **Voice producer:** generates or transcribes speech with Transformers.js and cleans it in AudioMass → **Composer:** creates short music beds in BeepBox or GridSound → **Motion designer:** adds animated titles and graphic sequences in Motion Canvas → **Video editor:** assembles variants in OpenCut → **Localization editor:** creates captions and translated transcript drafts with Transformers.js → **Thumbnail designer:** produces covers in miniPaint → **Publisher/growth manager:** uses `[GAP - NO JS APP - PeerTube/MediaCMS/Owncast publishing and analytics]` to schedule variants, distribute the release package, and compare audience performance. |
| **Podcast Studio** | **Producer:** writes the episode outline and show notes in Editor.js → **Audio editor:** records or cleans spoken audio in AudioMass and arranges music in GridSound → **Transcript editor:** generates the transcript with Transformers.js → **Designer:** creates episode artwork in miniPaint → **Promo editor:** creates video excerpts in OpenCut → **Publisher:** uses `[GAP - NO JS APP - Castopod/MediaCMS podcast hosting]` to publish the feed and episodes, attach show notes and artwork, and inspect listening statistics. |
| **Design and Brand Studio** | **Creative director:** collects references and defines the visual direction in Moodboard → **UX designer:** sketches concepts and interfaces in Excalidraw → **Brand designer:** produces raster and vector assets in miniPaint and SVG-Edit → **Information designer:** creates structured diagrams in draw.io → **3D artist:** produces low-poly brand assets in Blockbench → **Product-design team:** uses `[GAP - NO JS APP - Penpot real-time collaboration]` to turn approved sketches into shared components, interactive screens, review comments, and developer-ready interface specifications. |
| **Writer and Publisher Studio** | **Writer:** drafts structured chapters in Editor.js or BlockNote → **Story editor:** maps narrative structure in Mermaid or builds branching content in Twine → **Illustrator:** creates supporting artwork in miniPaint → **Document producer:** reviews and assembles the PDF with PDF.js and pdf-lib → **Presenter:** turns the material into a talk in OpenSlides → **Print designer:** uses `[GAP - NO JS APP - Scribus print layout]` to paginate the manuscript, manage typography, and prepare press-ready files → **Publisher:** uses `[GAP - NO JS APP - Ghost/WordPress/BookStack publishing]` to publish articles or chapters, manage navigation and newsletters, and maintain the public archive. |
| **Small-business Office Studio** | **Operations manager:** maintains budgets and operating sheets in Univer → **Form designer:** creates intake forms with JSON Forms → **Database owner:** uses `[GAP - NO JS APP - Grist/Baserow/Teable/NocoDB relational workspace]` to define linked customer, project, invoice, and inventory records and give each team a filtered operational view → **Analyst:** queries and visualizes business data with DuckDB-Wasm and Perspective → **Project manager:** uses `[GAP - NO JS APP - Plane/Vikunja project management]` to break projects into assigned tasks, manage deadlines, and track status and blockers → **Office writer:** prepares documents in Editor.js → **Document specialist:** assembles PDFs with PDF.js and pdf-lib → **Approver:** uses `[GAP - NO JS APP - Documenso signatures]` to route the final document, capture legally meaningful signatures, and retain the audit trail. |
| **Consultant/Agency Studio** | **Strategist:** writes the client brief, requirements, and recommendations in Editor.js → **Business analyst:** maps the client’s current and proposed processes in draw.io or Excalidraw → **Financial consultant:** models budget, staffing, and timeline assumptions in Univer → **Presentation designer:** turns the findings into a client deck in OpenSlides → **Account lead:** assembles the final proposal with PDF.js and pdf-lib → **Client approver:** uses `[GAP - NO JS APP - Documenso signatures]` to review, sign, and return the approved statement of work with an audit trail → **Delivery manager:** uses `[GAP - NO JS APP - Plane delivery management]` to convert the approved scope into milestones, owners, deadlines, and client-visible status → **Client:** uses `[GAP - NO JS APP - Baserow/Appsmith client portal]` to submit inputs, inspect status, review deliverables, and answer outstanding requests. |
| **Product/Software Studio** | **Product manager:** writes the product brief and acceptance criteria in Editor.js → **Software architect:** maps flows and system design in Mermaid, Excalidraw, or draw.io → **Product designer:** uses `[GAP - NO JS APP - Penpot collaborative UI design]` to convert flows into interactive screens, reusable components, and reviewable prototypes → **Visual designer:** prepares SVG assets in SVG-Edit → **Engineering manager:** uses `[GAP - NO JS APP - Plane issue tracking]` to turn requirements into prioritized issues and sprints and track delivery blockers → **Product analyst:** explores usage data with DuckDB-Wasm and Perspective → **Internal-tools developer:** uses `[GAP - NO JS APP - Appsmith/ToolJet internal tools]` to build operational forms, admin screens, and dashboards over product data → **Product lead:** presents the roadmap and results in OpenSlides. |
| **Maker/Hardware Studio** | **Product engineer:** sketches the system and wiring concept in Excalidraw or draw.io → **Electronics engineer:** uses `[GAP - NO JS APP - KiCad PCB design]` to draw the circuit schematic, assign footprints, route the board, and export manufacturing files → **CAD designer:** creates parametric parts in JSCAD → **3D artist:** creates low-poly enclosures or product visuals in Blockbench → **Reviewer:** inspects the model in a Three.js preview → **Procurement specialist:** maintains the bill of materials and cost calculations in Univer. |
| **Music Creator Studio** | **Composer:** sketches melodies and loops in BeepBox → **Producer:** arranges the track in GridSound → **Audio editor:** trims and cleans recorded material in AudioMass → **Score editor:** uses `[GAP - NO JS APP - MuseScore notation]` to engrave the score, extract musician parts, and produce printable notation → **Designer:** creates cover art in miniPaint → **Promo editor:** creates an animated or video release asset in Motion Canvas or OpenCut → **Label or artist:** uses `[GAP - NO JS APP - music distribution service]` to deliver masters and metadata, schedule the release, and track platform availability. |
| **Sales and Customer Workflow** | **Researcher:** designs lead-qualification forms in JSON Forms → **Demand-generation manager:** uses `[GAP - NO JS APP - Formbricks public responses]` to publish forms, collect attributed responses, and qualify submissions → **Sales representative:** uses `[GAP - NO JS APP - Twenty CRM]` to create opportunities, record interactions, assign next actions, and forecast deal stages → **Customer:** uses `[GAP - NO JS APP - Cal.com booking]` to choose an available meeting slot and receive reminders → **Revenue-operations analyst:** models pricing and pipeline in Univer → **Proposal writer:** prepares the offer in Editor.js and OpenSlides → **Document specialist:** assembles the contract with PDF.js and pdf-lib → **Customer approver:** uses `[GAP - NO JS APP - Documenso signatures]` to sign the contract and return an auditable executed copy → **Sales analyst:** reviews conversion and revenue in Perspective. |

## Detailed workflow maps

### Course Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Outline, scripts, quizzes | Editor.js or BlockNote | — |
| Diagrams | Mermaid, Excalidraw, draw.io | — |
| Storyboard and visual direction | Moodboard | — |
| Raster/vector editing | miniPaint, SVG-Edit | [Krita](https://github.com/KDE/krita) / [Inkscape](https://gitlab.com/inkscape/inkscape) |
| AI image generation | — | [InvokeAI](https://github.com/invoke-ai/InvokeAI) / [ComfyUI](https://github.com/comfy-org/comfyui) |
| Narration/TTS | Transformers.js mini-app | [Piper](https://github.com/rhasspy/piper) / [OpenVoice](https://github.com/myshell-ai/OpenVoice) |
| Audio cleanup | AudioMass | [Audacity](https://github.com/audacity/audacity) |
| Video editing | OpenCut | [Kdenlive](https://invent.kde.org/multimedia/kdenlive) / [Shotcut](https://github.com/mltframework/shotcut) |
| Captions | Transformers.js Whisper mini-app | [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) |
| Slides | OpenSlides, Reveal.js/Marp export | — |
| Publishing | — | [MediaCMS](https://github.com/mediacms-io/mediacms) / [PeerTube](https://github.com/Chocobozzz/PeerTube) |
| LMS and learners | — | [Moodle](https://github.com/moodle/moodle) / [Open edX](https://github.com/openedx/edx-platform) |

### Indie Game Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Concept and references | Moodboard, Excalidraw | — |
| Sprite art | Piskel; Pixelorama only after web-export prototype | [LibreSprite](https://github.com/LibreSprite/LibreSprite) / [Aseprite](https://github.com/aseprite/aseprite) |
| Low-poly 3D | Blockbench | [Blender](https://github.com/blender/blender) |
| Story/dialogue | Twine | [Yarn Spinner](https://github.com/YarnSpinnerTool/YarnSpinner) / [Ink](https://github.com/inkle/ink) |
| Music | BeepBox, GridSound | [LMMS](https://github.com/LMMS/lmms) |
| Complete no-code game editor | GDevelop only after browser sealing prototype | [Godot](https://github.com/godotengine/godot) |
| Lightweight custom engine | Phaser/PixiJS/PlayCanvas/Babylon | ISPO must build the editor |
| Dedicated level editor | GDevelop tools if retained | [LDtk](https://github.com/deepnight/ldtk) / [Tiled](https://github.com/mapeditor/tiled) |
| Trailer | OpenCut | — |

### Campaign Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Brief and copy | Editor.js | — |
| Visual assets | Moodboard, miniPaint, SVG-Edit | [Penpot](https://github.com/penpot/penpot) for collaborative design |
| Video | OpenCut, Motion Canvas | — |
| Form design | JSON Forms | [Formbricks](https://github.com/formbricks/formbricks) for hosted responses |
| Lead sheet | Univer | [Baserow](https://gitlab.com/baserow/baserow) / [Grist](https://github.com/gristlabs/grist-core) for relational records |
| Reporting | Perspective/Vega-Lite | [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) for shared BI |
| CRM | — | [Twenty](https://github.com/twentyhq/twenty) |
| Scheduling | — | [Cal.com](https://github.com/calcom/cal.com) |
| External publication | — | Publishing/advertising connectors |

### Research and Data Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Notebook | Starboard Notebook | [JupyterLab](https://github.com/jupyterlab/jupyterlab) |
| Local SQL | DuckDB-Wasm | — |
| Spreadsheet | Univer | [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) for relational behavior |
| Charts | Perspective, Vega-Lite | — |
| Maps | kepler.gl | [QGIS](https://github.com/qgis/QGIS) |
| Diagrams | Mermaid, draw.io, Excalidraw | — |
| Presentation | OpenSlides | — |
| Team BI | — | [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) |

### Video and Podcast Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Screen/camera recording | — | [OBS Studio](https://github.com/obsproject/obs-studio) / [Cap](https://github.com/CapSoftware/Cap) / [Screenity](https://github.com/alyssaxuu/screenity) extension |
| Audio editing | AudioMass; GridSound experimental | [Audacity](https://github.com/audacity/audacity) |
| Video timeline | OpenCut | [Kdenlive](https://invent.kde.org/multimedia/kdenlive) / [Shotcut](https://github.com/mltframework/shotcut) |
| Transcription | Transformers.js | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) executable / [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) |
| Thumbnail | miniPaint | [Krita](https://github.com/KDE/krita) |
| Motion graphics | Motion Canvas | [Synfig](https://github.com/synfig/synfig) |
| Hosting | — | [PeerTube](https://github.com/Chocobozzz/PeerTube) / [MediaCMS](https://github.com/mediacms-io/mediacms) |
| Live streaming | — | [OBS Studio](https://github.com/obsproject/obs-studio) / [Owncast](https://github.com/owncast/owncast) |

### Viral AI Video Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Creative brief and production plan | Editor.js or BlockNote | — |
| Trend references and visual direction | Moodboard | — |
| Script, hooks, dialogue, and shot descriptions | Editor.js or BlockNote | — |
| Storyboard and shot map | Excalidraw, Mermaid | — |
| AI keyframes and visual assets | — | [ComfyUI](https://github.com/comfy-org/comfyui) / [InvokeAI](https://github.com/invoke-ai/InvokeAI) |
| Text-to-video and image-to-video generation | — | [ComfyUI](https://github.com/comfy-org/comfyui) / [Wan2.2](https://github.com/Wan-Video/Wan2.2) |
| Recurring presenter or portrait animation | — | [LivePortrait](https://github.com/KwaiVGI/LivePortrait) |
| Voice generation, transcription, and translation draft | Transformers.js | AI model licenses and voice-consent rules require separate review |
| Voice cleanup | AudioMass | [Audacity](https://github.com/audacity/audacity) |
| Music sketch | BeepBox, GridSound | — |
| Animated titles and graphic sequences | Motion Canvas | — |
| Variant assembly and final edit | OpenCut | [Kdenlive](https://invent.kde.org/multimedia/kdenlive) / [Shotcut](https://github.com/mltframework/shotcut) |
| Captions and localization | Transformers.js plus a custom caption UI | [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) |
| Thumbnail and cover image | miniPaint | [Krita](https://github.com/KDE/krita) |
| Publishing, scheduling, and channel analytics | — | [PeerTube](https://github.com/Chocobozzz/PeerTube) / [MediaCMS](https://github.com/mediacms-io/mediacms) / [Owncast](https://github.com/owncast/owncast) plus platform connectors |

**Shared-context example:** the producer approves a structured brief; the scriptwriter turns it into scenes; the storyboard artist adds shot IDs; AI creators attach generated clips to those IDs; OpenCut consumes the approved clips; caption and thumbnail roles derive their work from the final edit; the growth manager receives the finished video, metadata, captions, and cover as one release package.

### Design and Brand Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Moodboard/sketch | Moodboard, Excalidraw | — |
| Raster editor | miniPaint | [Krita](https://github.com/KDE/krita) |
| Vector editor | SVG-Edit | [Inkscape](https://gitlab.com/inkscape/inkscape) |
| Diagrams | draw.io, Mermaid | — |
| Low-poly 3D | Blockbench | [Blender](https://github.com/blender/blender) |
| General 3D scene app | Build with Babylon.js/Three.js | [Blender](https://github.com/blender/blender) |
| Collaborative design system | — | [Penpot](https://github.com/penpot/penpot) |
| Asset library | — | [Immich](https://github.com/immich-app/immich) / [PhotoPrism](https://github.com/photoprism/photoprism) |

### Office, Consultant, and Sales Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Sheets/documents | Univer, Editor.js, BlockNote | [ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer) / [CryptPad](https://github.com/cryptpad/cryptpad) for full collaboration |
| Forms | JSON Forms | [Formbricks](https://github.com/formbricks/formbricks) for hosted collection |
| Data analysis | DuckDB-Wasm, Perspective | — |
| Relational records | — | [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) / [Teable](https://github.com/teableio/teable) / [NocoDB](https://github.com/nocodb/nocodb) |
| Project management | — | [Plane](https://github.com/makeplane/plane) / [Vikunja](https://github.com/go-vikunja/vikunja) |
| CRM | — | [Twenty](https://github.com/twentyhq/twenty) |
| Scheduling | — | [Cal.com](https://github.com/calcom/cal.com) |
| Proposal PDF | PDF.js/pdf-lib | — |
| Electronic signature | — | [Documenso](https://github.com/documenso/documenso) |
| Internal app builder | — | [Appsmith](https://github.com/appsmithorg/appsmith) / [ToolJet](https://github.com/ToolJet/ToolJet) / [Budibase](https://github.com/Budibase/budibase) |
| Client portal | — | [Baserow](https://gitlab.com/baserow/baserow) / [Appsmith](https://github.com/appsmithorg/appsmith) class |

### Maker and Hardware Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Sketch/diagram | Excalidraw, draw.io | — |
| Scripted parametric model | JSCAD | [OpenSCAD](https://github.com/openscad/openscad) |
| Low-poly model | Blockbench | [Blender](https://github.com/blender/blender) |
| 3D preview | Babylon.js/Three.js mini-app | — |
| BOM and calculations | Univer | — |
| Professional parametric CAD | JSCAD covers scripted workflows | [FreeCAD](https://github.com/FreeCAD/FreeCAD) |
| PCB/electronics | — | [KiCad](https://gitlab.com/kicad/code/kicad) |
| Geospatial visualization | kepler.gl | [QGIS](https://github.com/qgis/QGIS) |

### Music Studio

| Step | Use now | Non-JS alternative or missing product |
|---|---|---|
| Melody/loop sketch | BeepBox | — |
| Browser DAW | GridSound, after audit | [LMMS](https://github.com/LMMS/lmms) |
| Waveform editing | AudioMass | [Audacity](https://github.com/audacity/audacity) |
| Notation | — | [MuseScore](https://github.com/musescore/MuseScore) |
| Artwork/video | miniPaint, Motion Canvas, OpenCut | — |
| Distribution | — | Music publishing service |

## Non-JS alternatives and unresolved gaps

This section keeps the important benchmark names even when a JavaScript app covers the same workflow. Names are plain here; the gap marker is reserved for inline workflow chains.

| Capability | Non-JS or server-based product | Current JS/TS coverage |
|---|---|---|
| Screen recording/streaming | [OBS Studio](https://github.com/obsproject/obs-studio) / [Cap](https://github.com/CapSoftware/Cap) | No current recording app; OpenCut handles editing only. |
| Professional 3D modeling/rendering | [Blender](https://github.com/blender/blender) | Blockbench for low-poly; Babylon.js/Three.js for custom scenes. |
| Professional digital painting | [Krita](https://github.com/KDE/krita) | miniPaint. |
| Professional vector design | [Inkscape](https://gitlab.com/inkscape/inkscape) | SVG-Edit. |
| Professional audio editing | [Audacity](https://github.com/audacity/audacity) | AudioMass. |
| Professional video editing | [Kdenlive](https://invent.kde.org/multimedia/kdenlive) / [Shotcut](https://github.com/mltframework/shotcut) | OpenCut. |
| Subtitle specialist suite | [Subtitle Edit](https://github.com/SubtitleEdit/subtitleedit) | Transformers.js plus a custom caption UI. |
| Native full game engine | [Godot](https://github.com/godotengine/godot) | GDevelop web prototype or Phaser/PlayCanvas builder. |
| Dedicated level editor | [LDtk](https://github.com/deepnight/ldtk) / [Tiled](https://github.com/mapeditor/tiled) | GDevelop tools or a custom PixiJS editor. |
| Relational Airtable-style workspace | [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) / [Teable](https://github.com/teableio/teable) / [NocoDB](https://github.com/nocodb/nocodb) | No complete app; Univer and DuckDB-Wasm cover subsets. |
| Collaborative product design | [Penpot](https://github.com/penpot/penpot) | Excalidraw and SVG-Edit cover subsets. |
| Generative image workflow | [InvokeAI](https://github.com/invoke-ai/InvokeAI) / [ComfyUI](https://github.com/comfy-org/comfyui) | No selected complete app. |
| AI video and portrait animation | [ComfyUI](https://github.com/comfy-org/comfyui) / [Wan2.2](https://github.com/Wan-Video/Wan2.2) / [LivePortrait](https://github.com/KwaiVGI/LivePortrait) | No current Store app; these require Python/GPU execution outside the present browser boundary. |
| Video/media hosting | [PeerTube](https://github.com/Chocobozzz/PeerTube) / [MediaCMS](https://github.com/mediacms-io/mediacms) / [Owncast](https://github.com/owncast/owncast) | No current app; requires a connector or future service type. |
| Project management | [Plane](https://github.com/makeplane/plane) / [Vikunja](https://github.com/go-vikunja/vikunja) | No current app. |
| CRM | [Twenty](https://github.com/twentyhq/twenty) | No current app. |
| Scheduling | [Cal.com](https://github.com/calcom/cal.com) | No current app. |
| Electronic signatures | [Documenso](https://github.com/documenso/documenso) | PDF.js/pdf-lib prepare documents only. |
| Hosted forms/surveys | [Formbricks](https://github.com/formbricks/formbricks) | JSON Forms covers authoring only. |
| Internal app builder | [Appsmith](https://github.com/appsmithorg/appsmith) / [ToolJet](https://github.com/ToolJet/ToolJet) / [Budibase](https://github.com/Budibase/budibase) | No complete current app. |
| Collaborative office suite | [CryptPad](https://github.com/cryptpad/cryptpad) / [ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer) | Univer core covers local editing subsets. |
| General notebook/server kernels | [JupyterLab](https://github.com/jupyterlab/jupyterlab) | Starboard Notebook and DuckDB-Wasm. |
| Shared BI | [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) | Perspective/Vega-Lite locally. |
| Professional CAD | [FreeCAD](https://github.com/FreeCAD/FreeCAD) | JSCAD for scripted browser CAD. |
| PCB design | [KiCad](https://gitlab.com/kicad/code/kicad) | No selected app. |
| Professional GIS | [QGIS](https://github.com/qgis/QGIS) | kepler.gl for visualization. |
| Music notation | [MuseScore](https://github.com/musescore/MuseScore) | No selected app. |
| Professional DAW | [LMMS](https://github.com/LMMS/lmms) | GridSound and AudioMass cover browser workflows. |
| Desktop publishing | [Scribus](https://github.com/scribusproject/scribus) | Editor.js + PDF.js/pdf-lib cover subsets. |
| CMS/newsletters | [Ghost](https://github.com/TryGhost/Ghost) / [WordPress](https://github.com/WordPress/wordpress-develop) / [BookStack](https://github.com/BookStackApp/BookStack) | Local document/export package only. |
| Digital asset management | [Immich](https://github.com/immich-app/immich) / [PhotoPrism](https://github.com/photoprism/photoprism) | No current app. |

## Best next integrations

This list now contains only complete browser apps with permissive licenses. It intentionally excludes libraries that require ISPO to build a new product UI and GPL/AGPL projects awaiting distribution review.

1. miniPaint
2. AudioMass
3. SVG-Edit
4. Piskel
5. Mermaid Live Editor
6. BeepBox
7. JS Paint
8. BitMappery
9. Efflux
10. Online 3D Viewer
11. JSCAD
12. Kiri:Moto/Mesh:Tool
13. draw.io, only after its asset and trademark review

Prototype the apps individually before treating an audience bundle as complete. In particular, the 3D workflow requires worker/CSP testing, and the podcast workflow remains incomplete without transcription and publishing.

## Investor-safe narrative

> ISPO turns browser-native applications and JavaScript/TypeScript engines into interoperable mini-apps. Agents coordinate structured work across them while users inspect and edit every artifact. The current product deliberately stays inside a secure browser boundary. A gap is shown only when no current Store app fills a workflow step—not merely because a more sophisticated native benchmark exists.

This is narrower than “any GitHub application can run in the Store,” but it is accurate, buildable, and demonstrable.
