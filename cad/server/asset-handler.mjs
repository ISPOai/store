import fs from "node:fs";

import { contentTypeForPath, resolveAssetPath } from "./workspace-root.mjs";

export function serveAsset({ workspaceRoot, file, response }) {
  const resolved = resolveAssetPath(workspaceRoot, file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    const error = new Error("Asset is not a file.");
    error.code = "not-found";
    throw error;
  }
  response.writeHead(200, {
    "cache-control": "private, no-store",
    "content-length": stat.size,
    "content-type": contentTypeForPath(resolved),
    "x-content-type-options": "nosniff",
  });
  fs.createReadStream(resolved).pipe(response);
}
