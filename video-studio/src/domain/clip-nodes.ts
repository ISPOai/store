// Pure composition-document clip builders shared by every authoring path —
// the live editor session, the library insert action, and the headless
// `import-media` command all construct clips through these functions so a
// clip authored anywhere spells identically in the durable document.
import type { AssetRecord, AuthoredNode, CompositionDocument, StageSpec, WritableAuthoredProps } from './schema.ts'

export function sceneNode(input: { name: string; width: number; height: number }): AuthoredNode {
  const props: WritableAuthoredProps = {
    name: input.name,
    x: Math.round(-input.width / 2),
    y: Math.round(-input.height / 2),
    width: Math.round(input.width),
    height: Math.round(input.height),
    fill: '#000000',
    active: true,
  }
  return { tag: 'scene', props, text: null, children: [] }
}

function positionedClip(
  tag: 'video' | 'image',
  input: { name: string; src: string; width: number; height: number; start: number },
): AuthoredNode {
  return {
    tag,
    props: {
      name: input.name,
      src: input.src,
      x: 0,
      y: 0,
      width: Math.round(input.width),
      height: Math.round(input.height),
      start: input.start,
    },
    text: null,
    children: [],
  }
}

export function videoClipNode(input: {
  name: string
  src: string
  width: number
  height: number
  start: number
}): AuthoredNode {
  return positionedClip('video', input)
}

export function imageClipNode(input: {
  name: string
  src: string
  width: number
  height: number
  start: number
}): AuthoredNode {
  return positionedClip('image', input)
}

export function audioClipNode(input: { name: string; src: string; start: number }): AuthoredNode {
  return {
    tag: 'audio',
    props: { name: input.name, src: input.src, start: input.start },
    text: null,
    children: [],
  }
}

export function textClipNode(input: {
  name: string
  x: number
  y: number
  fontSize: number
  color: string
  text: string
  start: number
}): AuthoredNode {
  return {
    tag: 'text',
    props: {
      name: input.name,
      x: input.x,
      y: input.y,
      fontSize: input.fontSize,
      color: input.color,
      start: input.start,
    },
    text: input.text,
    children: [],
  }
}

/** The default display name for an imported asset: its basename minus extension. */
export function clipNameForAsset(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name
}

/**
 * The clip an imported asset becomes. `probe` dimensions are used when the
 * media was probed; otherwise the clip starts at stage size. Returns `null`
 * for asset kinds this app cannot place on a timeline.
 */
export function clipNodeForAsset(
  asset: Pick<AssetRecord, 'kind' | 'name' | 'url'>,
  stage: StageSpec,
  startSeconds: number,
  probe: { width: number | null; height: number | null } = { width: null, height: null },
): AuthoredNode | null {
  const name = clipNameForAsset(asset.name)
  const start = Math.max(0, startSeconds)
  if (asset.kind === 'video' || asset.kind === 'image') {
    const tag = asset.kind === 'video' ? videoClipNode : imageClipNode
    return tag({
      name,
      src: asset.url,
      width: probe.width ?? stage.width,
      height: probe.height ?? stage.height,
      start,
    })
  }
  if (asset.kind === 'audio') {
    return audioClipNode({ name, src: asset.url, start })
  }
  return null
}

export interface DocumentInsert {
  /** The document with the clip inserted, plus the scene path it landed in. */
  readonly document: CompositionDocument
  /** Index path of the clip inside `document.scenes` ([] when not inserted). */
  readonly clipPath: readonly number[]
}

/**
 * Inserts one clip node into the document's first scene, creating that scene
 * (sized to the stage) when the document has none. Pure: returns a new
 * document, never mutates the input.
 */
export function insertClipIntoDocument(
  document: CompositionDocument,
  clip: AuthoredNode,
): DocumentInsert {
  if (document.scenes.length === 0) {
    const scene = sceneNode({ name: 'Scene 1', width: document.stage.width, height: document.stage.height })
    return {
      document: { ...document, scenes: [{ ...scene, children: [clip] }] },
      clipPath: [0, 0],
    }
  }
  const scenes = document.scenes.map((scene, index) => {
    if (index !== 0) return scene
    return { ...scene, children: [...scene.children, clip] }
  })
  return { document: { ...document, scenes }, clipPath: [0, document.scenes[0].children.length] }
}
