import { scanCadDirectory } from "../vendor/text-to-cad/viewer/src/server/catalog/cadDirectoryScanner.mjs";

import { resolveAssetPath } from "./workspace-root.mjs";

export function readCatalog({ workspaceRoot }) {
  const catalog = scanCadDirectory({
    repoRoot: workspaceRoot,
    rootDir: "workspaces",
    includeArtifactStatus: true,
  });
  return {
    schemaVersion: catalog.schemaVersion,
    entries: catalog.entries.map((entry) => rewriteEntry(workspaceRoot, entry)),
  };
}

function rewriteEntry(workspaceRoot, entry) {
  const rawPath = String(entry.url || "").split("?", 1)[0].replace(/^\/+/, "");
  if (rawPath) resolveAssetPath(workspaceRoot, rawPath);
  return {
    ...entry,
    url: rawPath ? `/api/asset?file=${encodeURIComponent(rawPath)}` : "",
  };
}
