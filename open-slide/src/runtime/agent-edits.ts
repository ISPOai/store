// Source edits, dispatched to an agent.
//
// A slide is compiled app source and a sandboxed app cannot write the project
// root, so the app cannot edit a deck by itself. What it can do is ask an agent
// to: `agent.spawn` with `projectId` set to THIS project is a SELF-RUN (spec
// §10.22) and needs only the `agent.dispatch` request — no privileged grant, no
// per-use consent prompt.
//
// The agent edits `src/slides/<id>/index.tsx`, the host's build watcher sees it
// (slides live under the entry directory for exactly this reason), the project
// rebuilds and the app reloads with the change. That is this platform's version
// of upstream's edit-and-see-it loop; the difference is that it is agent-driven
// and takes seconds rather than being instant.

import { agent } from '@ispo/sdk'
import type { AgentId } from '@ispo/sdk'
import { writeText } from './store'

/** The app is served from `project://<projectId>/`, so its own id is the
 *  origin's hostname. There is no SDK call for self-identity. */
export function selfProjectId(): string {
  const id = globalThis.location?.hostname ?? ''
  if (!/^proj_[0-9a-f]{16,}$/.test(id)) {
    throw new Error(`cannot determine this project's id from ${JSON.stringify(id)}`)
  }
  return id
}

// `spawn` opens an agent *terminal*, so the target must be a CLI agent the user
// has installed. The first-party `ispo` agent is deliberately absent from this
// list: it runs in-process and has no terminal form — spawning it fails with
// "ISPO runs inside ISPO and has no terminal form. Open it as a chat instead."
const PREFERRED: AgentId[] = ['claude', 'codex', 'opencode', 'cursor', 'pi']

let cachedAgent: AgentId | null = null

async function pickAgent(): Promise<AgentId> {
  if (cachedAgent) return cachedAgent
  let available: AgentId[] = []
  try {
    const catalog = (await agent.list()) as unknown as {
      agents?: Array<{ id?: AgentId; available?: boolean; installed?: boolean }>
    }
    available = (catalog.agents ?? [])
      .filter((row) => row.available !== false && row.installed !== false)
      .map((row) => row.id)
      .filter((id): id is AgentId => Boolean(id))
  } catch {
    available = []
  }
  const usable = available.filter((id) => id !== 'ispo')
  const chosen = PREFERRED.find((id) => usable.includes(id)) ?? usable[0] ?? 'claude'
  cachedAgent = chosen
  return chosen
}

export type DispatchResult = { terminalId: string; agent: AgentId }

let taskSeq = 0

/**
 * Hand `task` to a self-run agent.
 *
 * The task is written to a file and the seed prompt is ONE LINE pointing at it.
 * That is not tidiness: the host stages a seed prompt by typing it into the
 * agent's terminal, and a multi-line prompt is submitted at the first newline —
 * the agent then receives only the trailing fragment. The first version of this
 * sent the whole instruction inline and the agent replied "Your message came
 * through truncated — it starts mid-sentence and the actual request is
 * missing", so every dispatched edit was silently lost.
 *
 * The agent runs with the project root as its working directory, and project
 * storage is a sibling of it, so `../.state/<projectId>/…` reaches the file
 * without the app needing to know an absolute path.
 */
export async function dispatchSourceTask(task: string): Promise<DispatchResult> {
  const chosen = await pickAgent()
  const projectId = selfProjectId()

  taskSeq += 1
  const name = `task-${Date.now().toString(36)}-${taskSeq}.md`
  await writeText(`agent-tasks/${name}`, task)
  const taskPath = `../.state/${projectId}/agent-tasks/${name}`

  const result = await agent.spawn({
    projectId,
    agent: chosen,
    seedPrompt: `Read ${taskPath} and carry out exactly what it says, then stop. Do not ask for confirmation.`,
    autoSubmit: true,
    // A spawn boots a harness; the default 10s RPC budget is not enough and a
    // timeout would orphan the agent mid-boot.
    timeoutMs: 60_000,
  })
  return { terminalId: result.terminalId, agent: chosen }
}

const HOUSE_RULES = `Rules for this repository:
- Slides live in src/slides/<id>/index.tsx and are compiled into the app bundle.
- A slide module exports \`design\`, optionally \`transition\` and \`meta\`, and
  default-exports an array of React page components: \`export default [A, B] satisfies Page[]\`.
- Types and Step/Steps/useSlidePageNumber come from '@open-slide/core'.
- After ADDING or REMOVING a slide directory, run: node vendor/build-slide-manifest.mjs
  (it regenerates src/generated/slide-manifest.ts, the static import map).
- Do not edit anything under src/app/ or vendor/ — that is vendored upstream code.
- Make the smallest change that satisfies the request, then stop.`

export function createSlideTask(id: string, source?: string): string {
  return `Create a new slide deck in this project.

Write it to src/slides/${id}/index.tsx.${
    source
      ? `\n\nUse exactly this source:\n\n\`\`\`tsx\n${source}\n\`\`\``
      : `\n\nAuthor a small starter deck with two pages: a title page and one content page. Keep it plain and readable.`
  }

Then run: node vendor/build-slide-manifest.mjs

${HOUSE_RULES}`
}

export function editSlideTask(slideId: string, description: string): string {
  return `Edit the slide deck "${slideId}" in this project.

The file is src/slides/${slideId}/index.tsx.

Requested change:
${description}

${HOUSE_RULES}`
}

export function deleteSlideTask(slideId: string): string {
  return `Delete the slide deck "${slideId}" from this project.

Remove the directory src/slides/${slideId}/ and then run:
node vendor/build-slide-manifest.mjs

${HOUSE_RULES}`
}

export function renameSlideTask(from: string, to: string): string {
  return `Rename the slide deck "${from}" to "${to}" in this project.

Move src/slides/${from}/ to src/slides/${to}/, then run:
node vendor/build-slide-manifest.mjs

${HOUSE_RULES}`
}
