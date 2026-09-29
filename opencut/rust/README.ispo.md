# Vendored opencut-wasm

This directory is a vendored copy of the upstream `opencut-wasm` Rust workspace
(`rust/crates/*` + `rust/wasm`), taken from upstream commit `6b1f38a9`
("refactor: split animation helpers by domain"), the source state behind the
published `opencut-wasm@0.2.10` npm package.

## Why vendored

Effect pass shaders are resolved by *name* inside this crate. The TS app hands
`EffectPass = { shader, uniforms }` where `shader` is a string key such as
`"gaussian-blur"`; the WGSL source for that key lives in Rust (see
`rust/crates/effects/src/pipeline.rs`). Adding a new "Look" (color adjust,
chroma key, filters, …) means adding a WGSL shader here and rebuilding the
`.wasm`, which is impossible against the published npm tarball alone.

Decision: **vendor** (not upstream-only, not an app-side WebGL rewrite).

- Upstream-only is not viable: the `opencut/opencut` GitHub repository is gone
  (404); the source now lives at `OpenCut-app/opencut-classic` (archived) /
  `OpenCut-app/OpenCut`. The npm tarball ships only compiled output.
- An app-side WebGL fallback is not viable either: the whole frame compositor
  (`initCompositor` / `uploadTexture` / `renderFrame`), not just effects, is
  implemented in this crate. Reimplementing it in TypeScript would be a rewrite
  of the renderer, not a shader change.

Keeping the crate source here (byte-identical to upstream apart from the trimmed
workspace `Cargo.toml`) means a future upstream release can still be diffed in.

## Build

From `app/`:

```sh
pnpm build:wasm   # == pnpm build, produces rust/wasm/pkg
```

This compiles `opencut-wasm` for `wasm32-unknown-unknown` and runs
`wasm-bindgen --target bundler`, emitting an npm package at `rust/wasm/pkg`
with the same file shape as the published package:

- `opencut_wasm_bg.wasm`
- `opencut_wasm.js`
- `opencut_wasm_bg.js`
- `opencut_wasm.d.ts`
- `package.json`

Requirements: `cargo`, the `wasm32-unknown-unknown` target
(`rustup target add wasm32-unknown-unknown`), and a `wasm-bindgen` CLI matching
the version pinned in `rust/Cargo.lock`.

## Adding a shader

1. Add a WGSL file under `rust/crates/effects/src/shaders/`.
2. In `rust/crates/effects/src/pipeline.rs`:
   - `const <NAME>_SHADER_SOURCE: &str = include_str!("shaders/<name>.wgsl");`
   - create a shader module + render pipeline and insert it into the
     `pipelines` map keyed by the shader *name* the app uses.
   - extend `pack_effect_uniforms` to accept that shader's uniforms.
3. Register the app-side `EffectDefinition` (TS) with the same shader name and
   uniform names (`src/effects/definitions/`), then `pnpm build:wasm`.

Note: `pack_effect_uniforms` is currently hard-coded to the gaussian-blur
uniforms (`u_sigma`, `u_step`, `u_direction`). Phase 2 effects will need to
generalise this to a per-shader uniform layout; that refactor belongs to the
effects tasks (ISPO-110 / ISPO-113 / ISPO-114), not to this vendoring.

## Consuming the local build

The app currently resolves `opencut-wasm` from the published npm package. To use
a locally built shader set, point the dependency at `rust/wasm/pkg` (a `file:`
or pnpm-workspace dependency) and run the build before install, or publish
`rust/wasm/pkg` to a registry. This swap is intentionally left to the
integration owner so it does not collide with in-flight app work.
