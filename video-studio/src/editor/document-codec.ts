// Composition document ↔ engine world codec. The document is the durable
// truth (see domain/schema.ts); the world is the live editing surface. The
// vendored reconciler's authored-element tree is the exchange format: this
// module builds trees the document can spell and reads trees the document
// can keep, nothing more.
import {
  authoredTree,
  createRuntimeDocument,
  insert,
  renderAuthored,
  renderProject,
  withDocument,
  type AuthoredTree,
  type RuntimeDocument,
} from '@diffusionstudio/reconciler'
import {
  getActiveEntity,
  getEntityChildren,
  Root,
  createRuntimeWorld,
  setPlayhead,
  togglePlayback,
  Background as StageBackground,
  FrameRate,
} from '@diffusionstudio/runtime'
import type { Entity, World } from 'koota'
import { parseCompositionDocument } from '../domain/schema.ts'
import type { EntityPayload } from '../domain/schema.ts'
import type { AuthoredNode, CompositionDocument, StageSpec } from '../domain/schema.ts'

export interface MountedDocument {
  readonly world: World
  readonly document: RuntimeDocument
  /** Tears down the reactive mount and every entity the document created. */
  dispose(): void
}

function stageTreeOf(doc: CompositionDocument): AuthoredTree {
  return {
    tag: 'stage',
    props: { background: doc.stage.background },
    children: doc.scenes.map(toEngineTree),
  }
}

/** Converts one validated document node into the engine's authored tree. */
function toEngineTree(node: AuthoredNode): AuthoredTree {
  const tree: AuthoredTree = {
    tag: node.tag,
    props: { ...node.props },
    children: node.children.map(toEngineTree),
  }
  if (node.text !== null) tree.text = node.text
  return tree
}

/**
 * Creates a world with a mounted document for `doc`. The engine singletons
 * (RenderSurface, AudioEngine, Library, Fonts) are attached by the session
 * layer after this returns.
 */
export function mountDocument(doc: CompositionDocument, projectId: string): MountedDocument {
  const world = createRuntimeWorld(projectId)
  world.set(FrameRate, { value: 30 })
  const document = createRuntimeDocument(world)
  const stageTree = stageTreeOf(doc)
  const disposeRender = renderProject(() => renderAuthored(stageTree), document)
  return {
    world,
    document,
    dispose() {
      disposeRender()
      document.dispose()
      // Koota caps the page at 16 live worlds; every remount (undo/redo
      // restore, export capture) must release its id or the universe fills
      // and the next mount throws "Too many worlds created".
      world.destroy()
    },
  }
}

/** Reads the current document out of a mounted world. */
export function readDocument(world: World, stage: StageSpec): CompositionDocument {
  const root = world.get(Root)
  if (!root) throw new Error('the world has no stage root')
  const rawScenes: unknown[] = []
  for (const child of getEntityChildren(world, root)) {
    const tree = authoredTree(world, child)
    if (tree) rawScenes.push(tree)
  }
  const background = root.get(StageBackground)?.value ?? 0x161616
  const backgroundHex = `#${background.toString(16).padStart(6, '0')}`
  const payload = { schemaVersion: 1, stage: { ...stage, background: backgroundHex }, scenes: rawScenes }
  // SAFETY: the engine's authored trees are plain JSON records; the parse
  // call below is the runtime proof and rejects anything outside the
  // documented composition vocabulary before it can be persisted.
  return parseCompositionDocument(payload as EntityPayload)
}

/** The world's active scene, or its first scene when none carries `Active`. */
export function activeScene(world: World): Entity | null {
  const active = getActiveEntity(world)
  if (active) return active
  const root = world.get(Root)
  if (!root) return null
  const first = getEntityChildren(world, root)[0]
  return first ?? null
}

// ───────────────────────────────────────────────────────────────────────────
// Authoring helpers — re-exported from the pure domain module so session
// code has one import surface; see domain/clip-nodes.ts.
// ───────────────────────────────────────────────────────────────────────────

export {
  audioClipNode,
  clipNameForAsset,
  clipNodeForAsset,
  imageClipNode,
  insertClipIntoDocument,
  sceneNode,
  textClipNode,
  videoClipNode,
} from '../domain/clip-nodes.ts'

// ───────────────────────────────────────────────────────────────────────────
// Live edits — every mutation the UI makes on the mounted document.
// ───────────────────────────────────────────────────────────────────────────

/** Inserts an authored subtree as the last child of `parent`; returns the new entity. */
export function insertChild(document: RuntimeDocument, world: World, parent: Entity, node: AuthoredNode): Entity {
  withDocument(document, () => {
    insert(document.node(parent), () => renderAuthored(toEngineTree(node)))
  })
  const created = getEntityChildren(world, parent).at(-1)
  if (created === undefined) {
    throw new Error('the document did not create an element for the inserted subtree')
  }
  return created
}

/** Removes the entity (and its subtree) from the document. */
export function removeEntityTree(document: RuntimeDocument, entity: Entity): void {
  withDocument(document, () => {
    const node = document.node(entity)
    const parent = node.parent
    if (parent) document.removeNode(parent, node)
  })
}

/** Writes one authored prop onto an entity. */
export function writeProp(
  document: RuntimeDocument,
  entity: Entity,
  name: string,
  value: string | number | boolean | undefined,
): void {
  withDocument(document, () => {
    const node = document.node(entity)
    document.setProperty(node, name, value)
  })
}

/** Replaces a text element's content (its text child, not a prop). */
export function writeText(document: RuntimeDocument, entity: Entity, text: string): void {
  withDocument(document, () => {
    const node = document.node(entity)
    for (const child of [...node.children]) {
      if (document.isTextNode(child)) document.removeNode(node, child)
    }
    if (text !== '') document.insertNode(node, document.createTextNode(text))
  })
}

export { setPlayhead, togglePlayback }
