import { normalizeWorkspaceKey } from "./workspace-root.mjs";

export function generationStatusPayload({ generationState, id }) {
  const workspaceKey = normalizeWorkspaceKey(id);
  return generationState.get(workspaceKey) || {
    id: workspaceKey,
    status: "unknown",
    updatedAt: new Date().toISOString(),
  };
}
