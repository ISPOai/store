import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertArtifactBytes,
  createRuntimeWorkspaceRoot,
  normalizeArtifactName,
  normalizeWorkspaceKey,
  resolveAssetPath,
  resolveRuntimeTempRoot,
  resolveWorkspaceArtifact,
  runtimeWorkspaceParent,
} from "./workspace-root.mjs";

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cad-boundary-test-"));
  fs.mkdirSync(path.join(root, "workspaces"), { recursive: true });
  return root;
}

test("runtime workspaces stay inside the host-approved project temp root", () => {
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "cad-runtime-root-test-"));
  try {
    const root = createRuntimeWorkspaceRoot({
      projectId: "proj_test-runtime",
      tempRoot: tempBase,
    });
    assert.equal(
      path.dirname(root),
      runtimeWorkspaceParent("proj_test-runtime", tempBase),
    );
    assert.equal(fs.existsSync(path.join(root, "workspaces")), true);
    assert.throws(
      () => runtimeWorkspaceParent("../outside", tempBase),
      /project ID is invalid/i,
    );
  } finally {
    fs.rmSync(tempBase, { recursive: true, force: true });
  }
});

test("runtime temp discovery requires the host-provided macOS temp root", () => {
  assert.equal(
    resolveRuntimeTempRoot({
      env: { TMPDIR: "/private/custom-temp/" },
      platform: "darwin",
      fallback: "/tmp",
    }),
    "/private/custom-temp",
  );
  assert.throws(
    () =>
      resolveRuntimeTempRoot({
        env: {},
        platform: "darwin",
        fallback: "/tmp",
      }),
    /did not receive TMPDIR/i,
  );
});

test("workspace keys and artifact names are bounded", () => {
  assert.equal(normalizeWorkspaceKey("model-a1"), "model-a1");
  assert.equal(normalizeArtifactName("model.step"), "model.step");
  assert.throws(() => normalizeWorkspaceKey("../outside"), /invalid/i);
  assert.throws(() => normalizeArtifactName("../model.step"), /invalid/i);
  assert.throws(() => normalizeArtifactName("model.exe"), /unsupported/i);
});

test("asset resolution rejects traversal and absolute paths", () => {
  const root = tempRoot();
  assert.throws(() => resolveAssetPath(root, "../outside.step"), /leaves|invalid/i);
  assert.throws(() => resolveAssetPath(root, "/tmp/outside.step"), /invalid/i);
  assert.equal(
    resolveAssetPath(root, "workspaces/model-a/model.step"),
    path.join(root, "workspaces/model-a/model.step"),
  );
});

test("workspace resolution rejects symlink traversal", () => {
  const root = tempRoot();
  const directory = path.join(root, "workspaces", "model-a");
  fs.mkdirSync(directory, { recursive: true });
  fs.symlinkSync(os.tmpdir(), path.join(directory, "linked"));
  assert.throws(
    () => resolveAssetPath(root, "workspaces/model-a/linked/out.step"),
    /symbolic/i,
  );
  assert.doesNotThrow(() => resolveWorkspaceArtifact(root, "model-a", "model.step"));
});

test("magic-byte checks reject mislabeled CAD bytes", () => {
  assert.doesNotThrow(() => assertArtifactBytes(
    "model.step",
    Buffer.from("ISO-10303-21;\\nEND-ISO-10303-21;\\n"),
    "model/step",
  ));
  assert.throws(
    () => assertArtifactBytes("model.step", Buffer.from("not step"), "model/step"),
    /signature/i,
  );
  assert.doesNotThrow(() => assertArtifactBytes(
    "model.glb",
    Buffer.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]),
    "model/gltf-binary",
  ));
});
