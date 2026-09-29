#!/usr/bin/env node
// Builds the vendored `opencut-wasm` crate and emits an npm-ready package
// under `rust/wasm/pkg` that mirrors the published `opencut-wasm` package
// shape (opencut_wasm.js / opencut_wasm_bg.js / opencut_wasm_bg.wasm /
// opencut_wasm.d.ts + package.json). See `rust/README.md`.
//
// Requires: cargo, the `wasm32-unknown-unknown` target, and a `wasm-bindgen`
// CLI whose version matches the one pinned in `rust/Cargo.lock`.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rustDir = resolve(scriptDir, "../rust");
const crateDir = resolve(rustDir, "wasm");
const pkgDir = resolve(crateDir, "pkg");
const target = "wasm32-unknown-unknown";
const outName = "opencut_wasm";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
}

function runCapture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw new Error(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
  return result.stdout.trim();
}

if (!existsSync(rustDir)) {
  throw new Error(`Rust workspace not found at ${rustDir}`);
}

const version = readVersion(crateDir);
const wasmPath = resolve(
  rustDir,
  "target",
  target,
  "release",
  `${outName}.wasm`,
);

const lockWasmBindgen = readLockedVersion(rustDir, "wasm-bindgen");
const cliWasmBindgen = runCapture("wasm-bindgen", ["--version"], rustDir);
if (lockWasmBindgen && !cliWasmBindgen.startsWith(`wasm-bindgen ${lockWasmBindgen}`)) {
  throw new Error(
    `wasm-bindgen CLI (${cliWasmBindgen}) does not match the version pinned in ` +
      `rust/Cargo.lock (${lockWasmBindgen}). Install a matching CLI, e.g. ` +
      `\`cargo install wasm-bindgen-cli --version ${lockWasmBindgen}\`.`,
  );
}

run("cargo", ["build", "--target", target, "--release", "-p", "opencut-wasm"], rustDir);

if (!existsSync(wasmPath)) {
  throw new Error(`Expected wasm output not found at ${wasmPath}`);
}

mkdirSync(pkgDir, { recursive: true });
run(
  "wasm-bindgen",
  ["--target", "bundler", "--out-dir", pkgDir, "--out-name", outName, wasmPath],
  rustDir,
);

// The published package ships a single self-contained `opencut_wasm.d.ts`
// (complex descriptors are typed `any`), so drop the auxiliary module types.
const extraTypes = resolve(pkgDir, `${outName}_bg.wasm.d.ts`);
if (existsSync(extraTypes)) {
  rmSync(extraTypes);
}

writeFileSync(
  resolve(pkgDir, "package.json"),
  JSON.stringify(
    {
      name: "opencut-wasm",
      type: "module",
      description: "Shared video editor logic compiled to WebAssembly",
      version,
      license: "MIT",
      repository: {
        type: "git",
        url: "https://github.com/opencut/opencut",
      },
      files: [
        "opencut_wasm_bg.wasm",
        "opencut_wasm.js",
        "opencut_wasm_bg.js",
        "opencut_wasm.d.ts",
      ],
      main: "opencut_wasm.js",
      types: "opencut_wasm.d.ts",
      sideEffects: ["./opencut_wasm.js", "./snippets/*"],
    },
    null,
    2,
  ) + "\n",
);

console.log(`Built opencut-wasm@${version} -> ${pkgDir}`);

function readVersion(dir) {
  const manifest = readFileSync(resolve(dir, "Cargo.toml"), "utf8");
  const match = manifest.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error(`Could not read version from ${dir}/Cargo.toml`);
  }
  return match[1];
}

function readLockedVersion(dir, packageName) {
  const lock = readFileSync(resolve(dir, "Cargo.lock"), "utf8");
  const entry = lock.match(
    new RegExp(`\\[\\[package\\]\\]\\nname = "${packageName}"\\nversion = "([^"]+)"`),
  );
  return entry ? entry[1] : null;
}
