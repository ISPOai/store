# Browser-compatible open-source app landscape for the ISPO Store

**Spec-aligned:** 2026-08-28
**Scope:** applications that can become ISPO Store projects, plus named gaps showing which desirable native, hosted, or server products still lack a viable Store acquisition path.

## Executive conclusion

Every Store app presents a browser-rendered interface through `project://` and declares an app entry. For repositories without an existing descriptor, the current import detector recognizes these conventional entries:

- `src/main.tsx`
- `src/main.jsx`
- `src/main.ts`
- `src/main.js`

The visible interface runs in HTML/CSS and JavaScript/TypeScript. A maintained browser WebAssembly package is possible when it already has a JavaScript bridge. WebAssembly does not turn a Qt, GTK, Godot desktop, .NET, Java, or other native GUI into a browser UI.

The browser-rendered interface is not the whole runtime boundary. A Store app may request a reviewed host-supervised runtime plan for setup, local databases, and long-running services. A sealed loopback service can sit behind the app's same-origin `/api` path; named external destinations can use brokered egress after declaration and grant review; Docker or broad local automation requires an explicit privileged runtime review. Store provenance grants none of this authority automatically.

This report therefore uses three explicit result types:

- **BROWSER CANDIDATE:** a browser-native app or JS/TS component that can become an ISPO app.
- **SERVICE-BACKED CANDIDATE:** a product with a browser client whose local backend may fit the reviewed runtime model, subject to a concrete prototype and policy review.
- **GAP:** a native-only product, public deployment, or external service workflow with no selected Store acquisition path.

Keeping benchmark names in the gap rows is intentional. It shows investors and product planners the quality bar a future Store app or native connector would need to match.

The current curated catalog contains **OpenCut, Moodboard, and Excalidraw**. Every other project in this report is a candidate or benchmark, not an already installable Store app.

## Runtime boundary

```text
STORE APP DISPLAY
  project:// HTML/CSS + JavaScript/TypeScript UI
  descriptor appEntry; conventional detection at src/main.tsx | jsx | ts | js
  optional browser Worker/Wasm package with maintained JS bridge
                    │
                    ├── @ispo/sdk / postMessage → host
                    └── same-origin /api → reviewed host-supervised service

NOT A DIRECT STORE DISPLAY
  unchanged native desktop GUI or remote-desktop surface
  direct localhost/remote URL that bypasses project://
  unrestricted server or Docker runtime without host review
  public deployment presented as a consequence of local Store installation
```

The relevant sources are [`import-repo.ts`](https://github.com/ISPOai/ispo/blob/main/apps/desktop/src/main/projects/import-repo.ts), [spec §3.15](https://github.com/ISPOai/ispo/blob/main/docs/spec/sections/sec-3/sec-3-15.md), [spec §3.21](https://github.com/ISPOai/ispo/blob/main/docs/spec/sections/sec-3/sec-3-21.md), [spec §22](https://github.com/ISPOai/ispo/blob/main/docs/spec/sections/sec-22.md), and the local [ISPO Store README](../../README.md).

## Eligibility labels

| Label | Meaning |
|---|---|
| **CURRENT** | Present in `catalog.json` as an installable Store app. |
| **READY** | Existing browser application; adaptation is mainly SDK integration, a meaningful command catalog, durable data exchange, CSP, and packaging. |
| **BUILD UI** | Useful JS/TS library or engine; an ISPO-specific mini-app must be built around it. |
| **SERVICE-BACKED PROTOTYPE** | Browser client plus local service stack; prove the reviewed runtime plan, persistence, egress, and lifecycle before commitment. |
| **HEAVY ADAPTATION** | A browser distribution exists, but integration and build assumptions require a prototype. |
| **INLINE GAP** | Native-only, public deployment, or external service step with no selected Store or connector path. |

## Best usable projects after cleanup

### Complete or nearly complete browser applications

| Project | Capability | Browser technology | License | Result |
|---|---|---|---|---|
| [AudioMass](https://github.com/pkalogiros/AudioMass) | Audio/waveform editing | JavaScript, Web Audio | MIT | **READY** |
| [miniPaint](https://github.com/viliusle/miniPaint) | Layered raster image editing | JavaScript, Canvas | MIT | **READY** |
| [SVG-Edit](https://github.com/SVG-Edit/svgedit) | Vector editing | JavaScript, SVG | MIT | **READY** |
| [draw.io](https://github.com/jgraph/drawio) | Diagrams and whiteboards | JavaScript | Apache-2.0 code | **READY**; review stencil and trademark terms. |
| [Piskel](https://github.com/piskelapp/piskel) | Sprites and pixel art | JavaScript | Apache-2.0 | **READY** |
| [Blockbench](https://github.com/JannisX11/blockbench) | Low-poly 3D models | JavaScript, WebGL | GPL-3.0 | **READY** |
| [Twine](https://github.com/klembot/twinejs) | Branching interactive stories | TypeScript | GPL-3.0 | **READY** |
| [BeepBox](https://github.com/johnnesky/beepbox) | Music sketching | TypeScript, Web Audio | MIT | **READY** |
| [GridSound](https://github.com/gridsound/daw) | Browser DAW | JavaScript, Web Audio | AGPL-3.0 | **HEAVY ADAPTATION**; audit its “half open-source” statement, assets, and submodules. |
| [Starboard Notebook](https://github.com/gzuidhof/starboard-notebook) | Browser notebook | TypeScript | MPL-2.0 | **READY / REVIEW** |
| [GDevelop](https://github.com/4ian/GDevelop) | No-code game editor | React/JavaScript UI with browser-compiled core | MIT | **HEAVY ADAPTATION**; keep only if its browser distribution can be sealed and bridged. |
| [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) | Pixel art and animation | Existing Godot web export with JS/Wasm loader | MIT | **HEAVY ADAPTATION**; canvas-level integration, not DOM-native. Piskel is the safer first choice. |
| [JSCAD](https://github.com/jscad/OpenJSCAD.org) | Scripted parametric CAD | JavaScript, WebGL | MIT | **READY / ADAPT** |

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

### Service-backed candidates requiring runtime prototypes

| Project | Capability | Runtime shape | License | Result |
|---|---|---|---|---|
| [OpenSlides](https://github.com/OpenSlides/OpenSlides) | Presentation and assembly management | Browser client plus multi-service Docker/PostgreSQL/Redis stack | MIT | **SERVICE-BACKED PROTOTYPE**; not currently in `catalog.json`, and the full stack requires privileged runtime review. |
| [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) | Relational workspaces | Browser clients plus persistent local services | Mixed | **SERVICE-BACKED PROTOTYPE**; prove persistence, process lifecycle, and command export. |
| [Plane](https://github.com/makeplane/plane) / [Vikunja](https://github.com/go-vikunja/vikunja) | Project management | Browser clients plus application/database services | AGPL-3.0 / AGPL-3.0 | **SERVICE-BACKED PROTOTYPE**; local project management is plausible, while public collaboration remains outside Store acquisition. |
| [Twenty](https://github.com/twentyhq/twenty) | CRM | Browser client plus application/database services | Mixed | **SERVICE-BACKED PROTOTYPE**; prototype the local runtime and treat external integrations separately. |
| [Appsmith](https://github.com/appsmithorg/appsmith) / [ToolJet](https://github.com/ToolJet/ToolJet) / [Budibase](https://github.com/Budibase/budibase) | Internal app builders | Browser clients plus service/database stacks | Mixed | **SERVICE-BACKED PROTOTYPE**; likely privileged and substantially heavier than a browser-only port. |
| [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) | Shared BI | Browser clients plus analytics/database services | Mixed | **SERVICE-BACKED PROTOTYPE**; local dashboards are plausible, public/team deployment is a separate concern. |
| [ComfyUI](https://github.com/comfy-org/comfyui) / [InvokeAI](https://github.com/invoke-ai/InvokeAI) | Generative media workflows | Browser clients plus Python/GPU services | Mixed | **SERVICE-BACKED PROTOTYPE**; model licenses, downloads, hardware, and runtime policy require separate review. |

### Current catalog apps

- **Excalidraw** — sketches, wireframes, and diagrams (**CURRENT**).
- **Moodboard** — visual references and style direction (**CURRENT**).
- **OpenCut** — browser video editing (**CURRENT**).

## Role-driven workflow examples with inline gaps

Each stage states who does the work, what they do, and which candidate integration they use. These are target workflows, not claims that every named app is currently in `catalog.json`. The resulting artifact moves through explicit Files, Entities, or command handoffs; there is no ambient cross-app shared context. Gap markers are reserved for steps without a selected Store or native-connector path.

| User group / studio | Example handoff workflow |
|---|---|
| **Course Studio** | **Instructional designer:** drafts the lesson, quiz, and narration script in Editor.js → **Learning designer:** turns concepts into diagrams with Mermaid and arranges references in Moodboard → **AI illustrator:** uses `[SERVICE-BACKED PROTOTYPE - InvokeAI/ComfyUI image generation]` to produce scene-consistent key art from the approved lesson and style board → **Illustrator:** corrects and finishes lesson graphics in miniPaint → **Voice producer:** records and cleans narration in AudioMass → **Video editor:** combines narration, images, and screen media in OpenCut → **Accessibility editor:** produces and corrects captions with Transformers.js → **Presenter:** creates supporting slides in a Reveal.js/Marp mini-app → **Publisher:** uses `[GAP - EXTERNAL DEPLOYMENT - MediaCMS/PeerTube publishing]` to upload releases, organize episodes, and expose playback pages → **Course administrator:** uses `[GAP - EXTERNAL SERVICE - Moodle/Open edX learner management]` to enroll learners, assign lessons, and track completion and quiz results. |
| **Game Studio** | **Creative director:** defines the visual direction in Moodboard and Excalidraw → **Pixel artist:** creates sprites and animations in Piskel or Pixelorama → **3D artist:** creates low-poly assets in Blockbench → **Narrative designer:** writes branching dialogue in Twine → **Composer:** sketches music in BeepBox or GridSound → **Game designer:** assembles mechanics and levels in GDevelop, or in a custom Phaser/PlayCanvas builder → **Marketing editor:** cuts the trailer in OpenCut. |
| **Campaign Studio** | **Campaign strategist:** writes the brief, audience, and copy in Editor.js → **Art director:** collects references in Moodboard → **Designer:** creates static assets in miniPaint and SVG-Edit → **Video producer:** creates campaign clips in OpenCut → **Researcher:** designs the questionnaire in JSON Forms → **Survey operator:** uses `[GAP - EXTERNAL DEPLOYMENT - Formbricks hosted responses]` to publish the form, collect submissions, and monitor response quality → **Operations specialist:** organizes leads and budget in Univer → **Analyst:** measures results in Perspective or Vega-Lite → **Sales owner:** uses `[SERVICE-BACKED PROTOTYPE - Twenty CRM]` to convert responses into leads, assign owners, and track follow-ups → **Coordinator:** uses `[GAP - EXTERNAL SERVICE - Cal.com scheduling]` to offer public booking slots and route meetings to the right team member → **Campaign lead:** presents results in a Reveal.js/Marp mini-app. |
| **Research Studio** | **Researcher:** writes hypotheses and executable notes in Starboard Notebook → **Data engineer:** loads files and queries local data with DuckDB-Wasm → **Analyst:** inspects and cleans tables in Univer → **Visualization specialist:** creates interactive charts in Perspective or Vega-Lite and maps in kepler.gl → **Knowledge architect:** documents relationships with Mermaid → **Research lead:** presents findings in a Reveal.js/Marp mini-app → **BI publisher:** uses `[SERVICE-BACKED PROTOTYPE - Superset/Metabase dashboards]` to publish governed local dashboards, control access, and refresh team metrics from shared data. |
| **Video Creator Studio** | **Camera or screen presenter:** uses `[GAP - NATIVE APP - OBS Studio/Cap recording]` to capture the screen, camera, microphone, and scene changes as source footage → **Audio editor:** cleans dialogue in AudioMass → **Video editor:** assembles the timeline in OpenCut → **Accessibility editor:** transcribes speech and prepares captions with Transformers.js → **Thumbnail designer:** creates the cover image in miniPaint → **Publisher:** uses `[GAP - EXTERNAL DEPLOYMENT - PeerTube/MediaCMS/Owncast hosting]` to upload the final video, schedule its release, expose playback, and manage the channel library. |
| **Viral AI Video Studio** | **Producer:** defines the audience, format, schedule, and approval criteria in Editor.js → **Trend strategist:** collects reference clips, hooks, and visual patterns in Moodboard → **Scriptwriter:** writes the hook, scenes, dialogue, and calls to action in Editor.js or BlockNote → **Storyboard artist:** turns the script into numbered shots with Excalidraw and Mermaid → **AI art director:** uses `[SERVICE-BACKED PROTOTYPE - ComfyUI/InvokeAI keyframe generation]` to generate style-consistent keyframes for every approved shot ID → **AI video artist:** uses `[SERVICE-BACKED PROTOTYPE - ComfyUI/Wan2.2 video generation]` to turn prompts and keyframes into candidate clips and attach them to the shot list → **Character animator:** uses `[SERVICE-BACKED PROTOTYPE - LivePortrait avatar animation]` to animate a recurring presenter from the approved portrait and performance track → **Voice producer:** generates or transcribes speech with Transformers.js and cleans it in AudioMass → **Composer:** creates short music beds in BeepBox or GridSound → **Motion designer:** adds animated titles and graphic sequences in Motion Canvas → **Video editor:** assembles variants in OpenCut → **Localization editor:** creates captions and translated transcript drafts with Transformers.js → **Thumbnail designer:** produces covers in miniPaint → **Publisher/growth manager:** uses `[GAP - EXTERNAL DEPLOYMENT - PeerTube/MediaCMS/Owncast publishing and analytics]` to schedule variants, distribute the release package, and compare audience performance. |
| **Podcast Studio** | **Producer:** writes the episode outline and show notes in Editor.js → **Audio editor:** records or cleans spoken audio in AudioMass and arranges music in GridSound → **Transcript editor:** generates the transcript with Transformers.js → **Designer:** creates episode artwork in miniPaint → **Promo editor:** creates video excerpts in OpenCut → **Publisher:** uses `[GAP - EXTERNAL DEPLOYMENT - Castopod/MediaCMS podcast hosting]` to publish the feed and episodes, attach show notes and artwork, and inspect listening statistics. |
| **Design and Brand Studio** | **Creative director:** collects references and defines the visual direction in Moodboard → **UX designer:** sketches concepts and interfaces in Excalidraw → **Brand designer:** produces raster and vector assets in miniPaint and SVG-Edit → **Information designer:** creates structured diagrams in draw.io → **3D artist:** produces low-poly brand assets in Blockbench → **Product-design team:** uses `[SERVICE-BACKED PROTOTYPE - Penpot real-time collaboration]` to turn approved sketches into shared components, interactive screens, review comments, and developer-ready interface specifications. |
| **Writer and Publisher Studio** | **Writer:** drafts structured chapters in Editor.js or BlockNote → **Story editor:** maps narrative structure in Mermaid or builds branching content in Twine → **Illustrator:** creates supporting artwork in miniPaint → **Document producer:** reviews and assembles the PDF with PDF.js and pdf-lib → **Presenter:** turns the material into a talk in a Reveal.js/Marp mini-app → **Print designer:** uses `[GAP - NATIVE APP - Scribus print layout]` to paginate the manuscript, manage typography, and prepare press-ready files → **Publisher:** uses `[GAP - EXTERNAL DEPLOYMENT - Ghost/WordPress/BookStack publishing]` to publish articles or chapters, manage navigation and newsletters, and maintain the public archive. |
| **Small-business Office Studio** | **Operations manager:** maintains budgets and operating sheets in Univer → **Form designer:** creates intake forms with JSON Forms → **Database owner:** uses `[SERVICE-BACKED PROTOTYPE - Grist/Baserow/Teable/NocoDB relational workspace]` to define linked customer, project, invoice, and inventory records and give each team a filtered operational view → **Analyst:** queries and visualizes business data with DuckDB-Wasm and Perspective → **Project manager:** uses `[SERVICE-BACKED PROTOTYPE - Plane/Vikunja project management]` to break projects into assigned tasks, manage deadlines, and track status and blockers → **Office writer:** prepares documents in Editor.js → **Document specialist:** assembles PDFs with PDF.js and pdf-lib → **Approver:** uses `[GAP - EXTERNAL SERVICE - Documenso signatures]` to route the final document, capture legally meaningful signatures, and retain the audit trail. |
| **Consultant/Agency Studio** | **Strategist:** writes the client brief, requirements, and recommendations in Editor.js → **Business analyst:** maps the client’s current and proposed processes in draw.io or Excalidraw → **Financial consultant:** models budget, staffing, and timeline assumptions in Univer → **Presentation designer:** turns the findings into a client deck in a Reveal.js/Marp mini-app → **Account lead:** assembles the final proposal with PDF.js and pdf-lib → **Client approver:** uses `[GAP - EXTERNAL SERVICE - Documenso signatures]` to review, sign, and return the approved statement of work with an audit trail → **Delivery manager:** uses `[SERVICE-BACKED PROTOTYPE - Plane delivery management]` to convert the approved scope into milestones, owners, deadlines, and local status → **Client:** uses `[GAP - EXTERNAL DEPLOYMENT - Baserow/Appsmith client portal]` to submit inputs, inspect status, review deliverables, and answer outstanding requests. |
| **Product/Software Studio** | **Product manager:** writes the product brief and acceptance criteria in Editor.js → **Software architect:** maps flows and system design in Mermaid, Excalidraw, or draw.io → **Product designer:** uses `[SERVICE-BACKED PROTOTYPE - Penpot collaborative UI design]` to convert flows into interactive screens, reusable components, and reviewable prototypes → **Visual designer:** prepares SVG assets in SVG-Edit → **Engineering manager:** uses `[SERVICE-BACKED PROTOTYPE - Plane issue tracking]` to turn requirements into prioritized issues and sprints and track delivery blockers → **Product analyst:** explores usage data with DuckDB-Wasm and Perspective → **Internal-tools developer:** uses `[SERVICE-BACKED PROTOTYPE - Appsmith/ToolJet internal tools]` to build operational forms, admin screens, and dashboards over product data → **Product lead:** presents the roadmap and results in a Reveal.js/Marp mini-app. |
| **Maker/Hardware Studio** | **Product engineer:** sketches the system and wiring concept in Excalidraw or draw.io → **Electronics engineer:** uses `[GAP - NATIVE APP - KiCad PCB design]` to draw the circuit schematic, assign footprints, route the board, and export manufacturing files → **CAD designer:** creates parametric parts in JSCAD → **3D artist:** creates low-poly enclosures or product visuals in Blockbench → **Reviewer:** inspects the model in a Three.js preview → **Procurement specialist:** maintains the bill of materials and cost calculations in Univer. |
| **Music Creator Studio** | **Composer:** sketches melodies and loops in BeepBox → **Producer:** arranges the track in GridSound → **Audio editor:** trims and cleans recorded material in AudioMass → **Score editor:** uses `[GAP - NATIVE APP - MuseScore notation]` to engrave the score, extract musician parts, and produce printable notation → **Designer:** creates cover art in miniPaint → **Promo editor:** creates an animated or video release asset in Motion Canvas or OpenCut → **Label or artist:** uses `[GAP - EXTERNAL SERVICE - music distribution service]` to deliver masters and metadata, schedule the release, and track platform availability. |
| **Sales and Customer Workflow** | **Researcher:** designs lead-qualification forms in JSON Forms → **Demand-generation manager:** uses `[GAP - EXTERNAL DEPLOYMENT - Formbricks public responses]` to publish forms, collect attributed responses, and qualify submissions → **Sales representative:** uses `[SERVICE-BACKED PROTOTYPE - Twenty CRM]` to create opportunities, record interactions, assign next actions, and forecast deal stages → **Customer:** uses `[GAP - EXTERNAL SERVICE - Cal.com booking]` to choose an available meeting slot and receive reminders → **Revenue-operations analyst:** models pricing and pipeline in Univer → **Proposal writer:** prepares the offer in Editor.js and a Reveal.js/Marp mini-app → **Document specialist:** assembles the contract with PDF.js and pdf-lib → **Customer approver:** uses `[GAP - EXTERNAL SERVICE - Documenso signatures]` to sign the contract and return an auditable executed copy → **Sales analyst:** reviews conversion and revenue in Perspective. |

## Detailed workflow maps

### Course Studio

| Step | Candidate path | Benchmark or remaining gap |
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
| Slides | Reveal.js/Marp mini-app | OpenSlides as a service-backed prototype |
| Publishing | — | [MediaCMS](https://github.com/mediacms-io/mediacms) / [PeerTube](https://github.com/Chocobozzz/PeerTube) |
| LMS and learners | — | [Moodle](https://github.com/moodle/moodle) / [Open edX](https://github.com/openedx/edx-platform) |

### Indie Game Studio

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
|---|---|---|
| Notebook | Starboard Notebook | [JupyterLab](https://github.com/jupyterlab/jupyterlab) |
| Local SQL | DuckDB-Wasm | — |
| Spreadsheet | Univer | [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) for relational behavior |
| Charts | Perspective, Vega-Lite | — |
| Maps | kepler.gl | [QGIS](https://github.com/qgis/QGIS) |
| Diagrams | Mermaid, draw.io, Excalidraw | — |
| Presentation | Reveal.js/Marp mini-app | OpenSlides as a service-backed prototype |
| Team BI | — | [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) |

### Video and Podcast Studio

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
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

| Step | Candidate path | Benchmark or remaining gap |
|---|---|---|
| Melody/loop sketch | BeepBox | — |
| Browser DAW | GridSound, after audit | [LMMS](https://github.com/LMMS/lmms) |
| Waveform editing | AudioMass | [Audacity](https://github.com/audacity/audacity) |
| Notation | — | [MuseScore](https://github.com/musescore/MuseScore) |
| Artwork/video | miniPaint, Motion Canvas, OpenCut | — |
| Distribution | — | Music publishing service |

## Benchmarks, service-backed candidates, and unresolved gaps

This section keeps important benchmark names even when a browser-only app covers part of the workflow. A service-backed product is not automatically Store-compatible: it still needs a browser entry, descriptor, meaningful command catalog, persistence design, and a runtime-policy prototype. Public deployment and third-party service operation remain outside Store acquisition.

| Capability | Benchmark or service-backed candidate | Store assessment |
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
| Relational Airtable-style workspace | [Grist](https://github.com/gristlabs/grist-core) / [Baserow](https://gitlab.com/baserow/baserow) / [Teable](https://github.com/teableio/teable) / [NocoDB](https://github.com/nocodb/nocodb) | **SERVICE-BACKED PROTOTYPE**; Univer and DuckDB-Wasm cover browser-only subsets. |
| Collaborative product design | [Penpot](https://github.com/penpot/penpot) | **SERVICE-BACKED PROTOTYPE**; Excalidraw and SVG-Edit cover browser-only subsets. |
| Generative image workflow | [InvokeAI](https://github.com/invoke-ai/InvokeAI) / [ComfyUI](https://github.com/comfy-org/comfyui) | **SERVICE-BACKED PROTOTYPE** for the Python/GPU services; model assets and hardware need separate review. |
| AI video and portrait animation | [ComfyUI](https://github.com/comfy-org/comfyui) / [Wan2.2](https://github.com/Wan-Video/Wan2.2) / [LivePortrait](https://github.com/KwaiVGI/LivePortrait) | **SERVICE-BACKED PROTOTYPE**; no current Store app, and model licenses, downloads, GPU access, and lifecycle need review. |
| Video/media hosting | [PeerTube](https://github.com/Chocobozzz/PeerTube) / [MediaCMS](https://github.com/mediacms-io/mediacms) / [Owncast](https://github.com/owncast/owncast) | **GAP — EXTERNAL DEPLOYMENT**; local Store installation does not create a public service. |
| Project management | [Plane](https://github.com/makeplane/plane) / [Vikunja](https://github.com/go-vikunja/vikunja) | **SERVICE-BACKED PROTOTYPE** for local use; public collaboration is separate. |
| CRM | [Twenty](https://github.com/twentyhq/twenty) | **SERVICE-BACKED PROTOTYPE**; external integrations require native connectors or separately reviewed egress. |
| Scheduling | [Cal.com](https://github.com/calcom/cal.com) | **GAP — EXTERNAL SERVICE** for public booking and reminders; a local-only runtime would not fill the workflow. |
| Electronic signatures | [Documenso](https://github.com/documenso/documenso) | **GAP — EXTERNAL SERVICE** for identity, delivery, and audit; PDF.js/pdf-lib prepare documents only. |
| Hosted forms/surveys | [Formbricks](https://github.com/formbricks/formbricks) | **GAP — EXTERNAL DEPLOYMENT** for public responses; JSON Forms covers local authoring. |
| Internal app builder | [Appsmith](https://github.com/appsmithorg/appsmith) / [ToolJet](https://github.com/ToolJet/ToolJet) / [Budibase](https://github.com/Budibase/budibase) | **SERVICE-BACKED PROTOTYPE**; likely a privileged, heavyweight runtime. |
| Collaborative office suite | [CryptPad](https://github.com/cryptpad/cryptpad) / [ONLYOFFICE](https://github.com/ONLYOFFICE/DocumentServer) | **SERVICE-BACKED PROTOTYPE** for local use; Univer core covers browser-only subsets. |
| General notebook/server kernels | [JupyterLab](https://github.com/jupyterlab/jupyterlab) | **SERVICE-BACKED PROTOTYPE** with a consequential command-runtime review; Starboard is the browser-local path. |
| Shared BI | [Superset](https://github.com/apache/superset) / [Metabase](https://github.com/metabase/metabase) | **SERVICE-BACKED PROTOTYPE**; Perspective/Vega-Lite cover local browser-only analysis. |
| Professional CAD | [FreeCAD](https://github.com/FreeCAD/FreeCAD) | JSCAD for scripted browser CAD. |
| PCB design | [KiCad](https://gitlab.com/kicad/code/kicad) | No selected app. |
| Professional GIS | [QGIS](https://github.com/qgis/QGIS) | kepler.gl for visualization. |
| Music notation | [MuseScore](https://github.com/musescore/MuseScore) | No selected app. |
| Professional DAW | [LMMS](https://github.com/LMMS/lmms) | GridSound and AudioMass cover browser workflows. |
| Desktop publishing | [Scribus](https://github.com/scribusproject/scribus) | Editor.js + PDF.js/pdf-lib cover subsets. |
| CMS/newsletters | [Ghost](https://github.com/TryGhost/Ghost) / [WordPress](https://github.com/WordPress/wordpress-develop) / [BookStack](https://github.com/BookStackApp/BookStack) | **GAP — EXTERNAL DEPLOYMENT** for public publishing; local authoring can use the document/export path. |
| Digital asset management | [Immich](https://github.com/immich-app/immich) / [PhotoPrism](https://github.com/photoprism/photoprism) | **SERVICE-BACKED PROTOTYPE** for a local library; no current Store app. |

## Best next integrations

1. AudioMass
2. miniPaint
3. Editor.js
4. Mermaid
5. Piskel
6. Transformers.js transcription/caption app
7. Univer-based Sheets app
8. DuckDB-Wasm data explorer
9. Perspective/Vega-Lite visualization app
10. JSON Forms form builder
11. Blockbench
12. Twine
13. BeepBox
14. JSCAD
15. PDF.js + pdf-lib document app

After those, prototype GDevelop, Pixelorama, GridSound, Motion Canvas, and Slidev individually before promising them as Store integrations.

## Investor-safe narrative

> ISPO turns browser applications, JavaScript/TypeScript engines, and selected service-backed products into locally installed, interoperable apps. Every app keeps a `project://` browser interface and exports reviewed commands and artifact handoffs. When a backend is necessary, the host supervises it under an independently reviewed runtime policy instead of treating Store provenance as execution authority. Public deployment and unchanged native desktop software remain outside Store acquisition.

This is narrower than “any GitHub application can run in the Store,” but broader and more accurate than an iframe-only model.
