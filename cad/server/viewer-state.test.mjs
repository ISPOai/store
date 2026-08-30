import assert from "node:assert/strict";
import test from "node:test";

import {
  cachedPreviewRefForWorkspace,
  isWorkingGeneration,
  needsCompletedGenerationReconciliation,
  previewArtifactName,
  shouldReconcileGenerationPreview,
  visibleModelStatus,
} from "../src/features/generations/generation-model.ts";
import { loadGlbMesh } from "../src/features/viewer/cad-source.ts";
import { sourceKindForUrl } from "../src/features/viewer/viewer-state.ts";

test("asset proxy URLs are classified by their decoded file parameter", () => {
  assert.equal(
    sourceKindForUrl(
      "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel-preview.glb",
    ),
    "glb",
  );
});

test("completed generations reconcile stale model and completion metadata", () => {
  assert.equal(
    needsCompletedGenerationReconciliation(
      {
        status: "completed",
        completedAt: null,
      },
      {
        status: "generating",
        previewRef: "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
      },
    ),
    true,
  );
  assert.equal(
    needsCompletedGenerationReconciliation(
      {
        status: "completed",
        completedAt: "2026-07-29T00:00:00.000Z",
      },
      {
        status: "ready",
        previewRef: "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
      },
    ),
    false,
  );
});

test("waiting generations with durable GLB artifacts reconcile stale runtime previews", () => {
  const generation = {
    status: "waiting",
    completedAt: null,
    artifactNames: [
      "brief.md",
      "model-preview.glb",
      "model.glb",
    ],
  };
  const model = {
    status: "generating",
    previewRef: "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel-preview.glb",
  };

  assert.equal(previewArtifactName(generation.artifactNames), "model.glb");
  assert.equal(shouldReconcileGenerationPreview(generation, model), true);
});

test("model rows show the active generation state instead of a stale model lifecycle state", () => {
  const model = {
    status: "generating",
    activeGenerationId: "generation-1",
  };
  const generations = [{
    id: "generation-1",
    data: {
      status: "waiting",
    },
  }];

  assert.equal(visibleModelStatus(model, generations), "waiting");
  assert.equal(isWorkingGeneration("waiting"), false);
  assert.equal(isWorkingGeneration("running"), true);
  assert.equal(isWorkingGeneration("generating"), true);
});

test("STEP is a valid durable preview source when no GLB copy exists", () => {
  assert.equal(
    previewArtifactName(["brief.md", "part.step", "validation.json"]),
    "part.step",
  );
});

test("runtime catalog entries replace stale preview references", () => {
  assert.equal(
    cachedPreviewRefForWorkspace(
      "/api/asset?file=workspaces%2Fgenerate-1%2Fmissing.glb",
      "generate-1",
      [{
        file: "generate-1/model.glb",
        url: "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
      }],
    ),
    "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
  );
  assert.equal(
    cachedPreviewRefForWorkspace(
      "/api/asset?file=workspaces%2Fgenerate-1%2Fmissing.glb",
      "generate-1",
      [],
    ),
    null,
  );
});

test("the viewer wrapper decodes GLB proxy responses without STEP-only options", async () => {
  const calls = [];
  const meshData = { vertices: new Float32Array(), indices: new Uint32Array() };
  const result = await loadGlbMesh(
    "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
    {
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      },
      decode: async (buffer) => {
        assert.equal(buffer.byteLength, 3);
        return meshData;
      },
    },
  );

  assert.equal(result, meshData);
  assert.deepEqual(calls, [{
    url: "/api/asset?file=workspaces%2Fgenerate-1%2Fmodel.glb",
    init: { cache: "no-store" },
  }]);
});
