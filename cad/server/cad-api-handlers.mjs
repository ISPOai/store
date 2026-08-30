import { URL } from "node:url";

import { serveAsset } from "./asset-handler.mjs";
import { readCatalog } from "./catalog-handler.mjs";
import { generationStatusPayload } from "./generation-status-handler.mjs";
import { healthPayload } from "./health.mjs";
import { processStepArtifact } from "./step-artifact-handler.mjs";
import { CadBoundaryError } from "./workspace-root.mjs";

export function createCadApiHandler({ workspaceRoot, generationState = new Map() }) {
  return async function handle(request, response) {
    applyCommonHeaders(response);
    const url = new URL(request.url || "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, healthPayload({ workspaceRoot }));
      }
      if (request.method === "GET" && url.pathname === "/catalog") {
        return sendJson(response, 200, readCatalog({ workspaceRoot }));
      }
      if (request.method === "GET" && url.pathname === "/asset") {
        return serveAsset({
          workspaceRoot,
          file: url.searchParams.get("file"),
          response,
        });
      }
      if (request.method === "POST" && url.pathname === "/step-artifact") {
        const result = await processStepArtifact({
          request,
          workspaceRoot,
          generationState,
          workspaceKey: url.searchParams.get("workspace"),
          artifactName: url.searchParams.get("file"),
        });
        return sendJson(response, 201, result);
      }
      if (request.method === "GET" && url.pathname === "/generation-status") {
        return sendJson(response, 200, generationStatusPayload({
          generationState,
          id: url.searchParams.get("id"),
        }));
      }
      return sendJson(response, 404, {
        ok: false,
        code: "not-found",
        message: "CAD API route not found.",
      });
    } catch (error) {
      const boundary = error instanceof CadBoundaryError;
      const notFound = error?.code === "ENOENT" || error?.code === "not-found";
      const status = boundary ? boundaryStatus(error.code) : notFound ? 404 : 422;
      return sendJson(response, status, {
        ok: false,
        code: boundary ? error.code : notFound ? "not-found" : "processing-failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": body.byteLength,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function applyCommonHeaders(response) {
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
}

function boundaryStatus(code) {
  if (code === "body-too-large" || code === "artifact-too-large") return 413;
  return 400;
}
