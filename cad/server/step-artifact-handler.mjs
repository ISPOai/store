import fs from "node:fs";

import { ensureStepTopologyArtifact } from "../vendor/text-to-cad/viewer/src/server/step/stepArtifactCompiler.mjs";

import {
  assertArtifactBytes,
  contentTypeForPath,
  extensionForName,
  normalizeArtifactName,
  normalizeWorkspaceKey,
  readBoundedBody,
  relativeAssetPath,
  resolveWorkspaceArtifact,
} from "./workspace-root.mjs";

export async function processStepArtifact({
  request,
  workspaceRoot,
  generationState,
  workspaceKey: requestedWorkspaceKey,
  artifactName: requestedArtifactName,
}) {
  const workspaceKey = normalizeWorkspaceKey(requestedWorkspaceKey);
  const artifactName = normalizeArtifactName(requestedArtifactName);
  const body = await readBoundedBody(request);
  assertArtifactBytes(artifactName, body, request.headers["content-type"]);

  const artifactPath = resolveWorkspaceArtifact(workspaceRoot, workspaceKey, artifactName);
  fs.writeFileSync(artifactPath, body, { flag: "wx" });
  generationState.set(workspaceKey, {
    id: workspaceKey,
    status: "processing",
    file: artifactName,
    updatedAt: new Date().toISOString(),
  });

  try {
    const extension = extensionForName(artifactName);
    let glbPath = extension === ".glb" ? artifactPath : "";
    let validation = null;
    if (extension === ".step" || extension === ".stp") {
      const result = await ensureStepTopologyArtifact({
        repoRoot: workspaceRoot,
        stepPath: artifactPath,
        force: true,
      });
      if (!result.ok) {
        throw new Error(result.error || result.validation?.error?.message || "STEP processing failed.");
      }
      glbPath = result.glbPath;
      validation = result.validation || null;
    }

    const payload = {
      ok: true,
      workspaceKey,
      file: artifactName,
      source: assetRef(workspaceRoot, artifactPath),
      preview: glbPath ? assetRef(workspaceRoot, glbPath) : null,
      validation,
      updatedAt: new Date().toISOString(),
    };
    generationState.set(workspaceKey, {
      id: workspaceKey,
      status: "ready",
      file: artifactName,
      preview: payload.preview,
      updatedAt: payload.updatedAt,
    });
    return payload;
  } catch (error) {
    generationState.set(workspaceKey, {
      id: workspaceKey,
      status: "failed",
      file: artifactName,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function assetRef(workspaceRoot, filePath) {
  const relative = relativeAssetPath(workspaceRoot, filePath);
  return {
    file: relative,
    url: `/api/asset?file=${encodeURIComponent(relative)}`,
    mimeType: contentTypeForPath(filePath),
    size: fs.statSync(filePath).size,
  };
}
