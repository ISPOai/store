import fs from "node:fs";
import path from "node:path";

export function healthPayload({ workspaceRoot }) {
  return {
    ok: true,
    service: "cad-api",
    sealed: true,
    pythonReady: fs.existsSync(path.resolve(".venv/bin/python")),
    workspaceReady: fs.existsSync(workspaceRoot),
  };
}
