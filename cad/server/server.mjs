import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

import { createCadApiHandler } from "./cad-api-handlers.mjs";
import { createRuntimeWorkspaceRoot } from "./workspace-root.mjs";

export function createCadServer({ workspaceRoot = createRuntimeWorkspaceRoot() } = {}) {
  const generationState = new Map();
  const server = http.createServer(createCadApiHandler({
    workspaceRoot,
    generationState,
  }));
  return { server, workspaceRoot, generationState };
}

export function startCadServer() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The host-supplied PORT is required.");
  }
  const runtime = createCadServer();
  runtime.server.listen(port, "127.0.0.1", () => {
    console.log(JSON.stringify({
      event: "cad-api-ready",
      host: "127.0.0.1",
      port,
      sealed: true,
    }));
  });
  const shutdown = () => {
    runtime.server.close(() => {
      try {
        fs.rmSync(runtime.workspaceRoot, { recursive: true, force: true });
      } finally {
        process.exit(0);
      }
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return runtime;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startCadServer();
}
