// Closed validation for every document shape that crosses a trust boundary
// into this app: rows read back from the `video.*` entity store, composition
// documents this app restores into an engine world, and asset references
// handed over from the media import flow. Each parse returns a typed domain
// value or throws DomainParseError — malformed data is rejected once, here,
// and never silently repaired.

export class DomainParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainParseError'
  }
}

// The boundary value every parse starts from: anything the entity store or
// a restored document may hand over, named once so parsers can accept it
// without spreading `unknown` through the app.
export type JsonPrimitive = string | number | boolean | null
export type AuthoredPropValue = string | number | boolean
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type EntityPayload =
  | JsonPrimitive
  | readonly EntityPayload[]
  | { readonly [key: string]: EntityPayload }
  | undefined

// Value-level type predicates (representation proved by value, not by
// `typeof` narrowing): a primitive passes `Object(v) !== v`, and the exact
// identity check against its boxed form proves which primitive it is.
function isJsonString(value: EntityPayload): value is string {
  return value !== undefined && value !== null && Object(value) !== value && String(value) === value
}

/** Exposed for the migration pipeline's integer proof. */
export function isJsonNumber(value: EntityPayload): value is number {
  return Number.isFinite(value)
}

function isJsonBoolean(value: EntityPayload): value is boolean {
  return value !== undefined && value !== null && Object(value) !== value && Boolean(value) === value
}

function isJsonObject(value: EntityPayload): value is { readonly [key: string]: EntityPayload } {
  return value !== undefined && value !== null && Object(value) === value && !Array.isArray(value)
}

function isJsonArray(value: EntityPayload): value is readonly EntityPayload[] {
  return Array.isArray(value)
}

export interface ProjectRecord {
  readonly title: string
  readonly width: number
  readonly height: number
  readonly fps: number
  readonly order: number
  readonly activeCompositionId: string | null
}

export interface CompositionRecord {
  readonly title: string
  readonly revision: number
  readonly document: CompositionDocument
}

export type AssetKind = 'image' | 'video' | 'audio' | 'other'

export interface AssetRecord {
  readonly name: string
  readonly mimeType: string
  readonly kind: AssetKind
  readonly url: string
  readonly sizeBytes: number
}

/** Library folder grouping: which `video.asset` ids sit in this folder. */
export interface AssetFolderRecord {
  readonly name: string
  readonly order: number
  readonly assetIds: readonly string[]
}

export type ExportFormat = 'mp4' | 'webm'

export type ExportJobState = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface ExportJobRecord {
  readonly format: ExportFormat
  readonly state: ExportJobState
  readonly progress: number
  readonly compositionId: string
  readonly resultPath: string | null
  readonly resultPublicId: string | null
  readonly error: string | null
}

// ───────────────────────────────────────────────────────────────────────────
// Composition document — the serializable scene tree this app edits.
//
// The shape is the vendored engine's authored-element tree (tag, props,
// text, children), restricted to the exact vocabulary this app authors and a
// bounded size. Unknown tags, unknown prop names, or wrong prop types are a
// parse failure, surfaced as "unsupported composition" rather than probed
// into the engine.
// ───────────────────────────────────────────────────────────────────────────

export type AuthorTag =
  | 'scene'
  | 'group'
  | 'sequence'
  | 'rect'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'solidPaint'

export interface StageSpec {
  readonly width: number
  readonly height: number
  readonly background: string
}

/** The owner contract for authored element props this app writes and reads. */
export type AuthoredProps = Readonly<Record<string, string | number | boolean>>

/** The mutable builder form of authored props (validation output, patches). */
export interface WritableAuthoredProps {
  [key: string]: AuthoredPropValue
}

/** The owner contract for a per-tag prop rule table. */
export interface PropRuleMap {
  readonly [key: string]: PropRule
}

export interface AuthoredNode {
  readonly tag: AuthorTag
  readonly props: AuthoredProps
  readonly text: string | null
  readonly children: readonly AuthoredNode[]
}

export interface CompositionDocument {
  readonly schemaVersion: 1
  readonly stage: StageSpec
  readonly scenes: readonly AuthoredNode[]
}

const MAX_DEPTH = 12
const MAX_NODES = 600
const MAX_TEXT_LENGTH = 20_000

type PropType = 'string' | 'number' | 'boolean'

interface PropRule {
  readonly type: PropType
  readonly min?: number
  readonly max?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly optional?: boolean
}

// The closed prop vocabulary per tag. Every prop this app writes is listed;
// restore accepts exactly this set. Ranges bound what the engine is asked to
// do with restored data (positions and sizes stay finite and sane, timing
// stays within one long movie, volumes stay in dB range).
const NUMBER = (min: number, max: number): PropRule => ({ type: 'number', min, max })
const STRING = (maxLength: number): PropRule => ({ type: 'string', maxLength })
const FLAG: PropRule = { type: 'boolean' }

const TAG_PROPS = {
  scene: {
    name: { ...STRING(80), optional: true },
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
    width: NUMBER(16, 7680),
    height: NUMBER(16, 4320),
    fill: { ...STRING(16), optional: true },
    active: { ...FLAG, optional: true },
  },
  group: {
    name: { ...STRING(80), optional: true },
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
  },
  sequence: {
    name: { ...STRING(80), optional: true },
  },
  rect: {
    name: { ...STRING(80), optional: true },
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
    width: NUMBER(0, 7680),
    height: NUMBER(0, 4320),
    cornerRadius: { ...NUMBER(0, 2000), optional: true },
    opacity: { ...NUMBER(0, 1), optional: true },
    fill: { ...STRING(16), optional: true },
    hidden: { ...FLAG, optional: true },
  },
  text: {
    name: { ...STRING(80), optional: true },
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
    width: { ...NUMBER(0, 7680), optional: true },
    height: { ...NUMBER(0, 4320), optional: true },
    color: { ...STRING(16), optional: true },
    fontFamily: { ...STRING(80), optional: true },
    fontSize: { ...NUMBER(1, 2000), optional: true },
    fontWeight: { ...STRING(12), optional: true },
    textAlign: { ...STRING(12), optional: true },
    textBaseline: { ...STRING(12), optional: true },
  },
  image: {
    name: { ...STRING(80), optional: true },
    src: STRING(512),
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
    width: NUMBER(0, 7680),
    height: NUMBER(0, 4320),
    cornerRadius: { ...NUMBER(0, 2000), optional: true },
  },
  video: {
    name: { ...STRING(80), optional: true },
    src: STRING(512),
    x: NUMBER(-100_000, 100_000),
    y: NUMBER(-100_000, 100_000),
    width: NUMBER(0, 7680),
    height: NUMBER(0, 4320),
    cornerRadius: { ...NUMBER(0, 2000), optional: true },
  },
  audio: {
    name: { ...STRING(80), optional: true },
    src: STRING(512),
  },
  solidPaint: {
    color: STRING(16),
  },
} satisfies Readonly<Record<AuthorTag, Readonly<Record<string, PropRule>>>>

// Timing props are valid on any timeline clip tag (not paints/groups).
const TIMING_PROPS = {
  start: NUMBER(0, 43_200),
  end: NUMBER(0, 43_200),
  sourceIn: NUMBER(0, 43_200),
  volume: NUMBER(-60, 6),
} satisfies Readonly<Record<string, PropRule>>

const CLIP_TAGS: ReadonlySet<AuthorTag> = new Set(['rect', 'text', 'image', 'video', 'audio', 'sequence'])

/** The closed element vocabulary this app authors and restores. */
const AUTHOR_TAGS: readonly AuthorTag[] = [
  'scene',
  'group',
  'sequence',
  'rect',
  'text',
  'image',
  'video',
  'audio',
  'solidPaint',
]

/** The named tag for `value`, proved by the closed vocabulary rather than asserted. */
function authorTagOf(value: string): AuthorTag | null {
  for (const tag of AUTHOR_TAGS) {
    if (tag === value) return tag
  }
  return null
}

function parseStringProp(rule: PropRule, value: EntityPayload, path: string): string {
  if (!isJsonString(value)) throw new DomainParseError(`${path} must be a string`)
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    throw new DomainParseError(`${path} must contain at least ${rule.minLength} characters`)
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    throw new DomainParseError(`${path} exceeds ${rule.maxLength} characters`)
  }
  return value
}

function parseBooleanProp(value: EntityPayload, path: string): boolean {
  if (!isJsonBoolean(value)) throw new DomainParseError(`${path} must be a boolean`)
  return value
}

function parseNumberProp(rule: PropRule, value: EntityPayload, path: string): number {
  if (!isJsonNumber(value)) throw new DomainParseError(`${path} must be a finite number`)
  if (rule.min !== undefined && value < rule.min) throw new DomainParseError(`${path} is below ${rule.min}`)
  if (rule.max !== undefined && value > rule.max) throw new DomainParseError(`${path} is above ${rule.max}`)
  return value
}

/**
 * The numeric bounds restore enforces for `name` on `tag`, resolved through
 * the same rule tables the parser applies, or null when the prop is not a
 * bounded number there. Authoring UI uses this to pre-clamp field commits so
 * a typed value can never stall history and autosave behind a parse refusal.
 */
export function numericPropBounds(tag: string, name: string): { readonly min: number; readonly max: number } | null {
  const nodeTag = authorTagOf(tag)
  if (nodeTag === null) return null
  const rules: PropRuleMap = TAG_PROPS[nodeTag]
  const timingRules: PropRuleMap = TIMING_PROPS
  const rule = rules[name] ?? (CLIP_TAGS.has(nodeTag) ? timingRules[name] : undefined)
  if (rule === undefined || rule.type !== 'number') return null
  if (rule.min === undefined || rule.max === undefined) return null
  return { min: rule.min, max: rule.max }
}

function parseIntegerProp(rule: PropRule, value: EntityPayload, path: string): number {
  const parsed = parseNumberProp(rule, value, path)
  if (!Number.isInteger(parsed)) throw new DomainParseError(`${path} must be an integer`)
  return parsed
}

let nodeBudget = 0

function parseAuthoredNode(raw: EntityPayload, path: string, depth: number): AuthoredNode {
  if (depth > MAX_DEPTH) throw new DomainParseError(`${path} exceeds the maximum nesting depth`)
  if (nodeBudget <= 0) throw new DomainParseError('composition document exceeds the maximum node count')
  nodeBudget -= 1
  if (!isJsonObject(raw)) throw new DomainParseError(`${path} must be an object`)

  const rawTag = raw['tag']
  if (!isJsonString(rawTag)) throw new DomainParseError(`${path}.tag must be a string`)
  const nodeTag = authorTagOf(rawTag)
  if (nodeTag === null) {
    throw new DomainParseError(`${path}.tag is not a supported element tag`)
  }
  const rules: PropRuleMap = TAG_PROPS[nodeTag]

  const rawProps = raw['props']
  if (!isJsonObject(rawProps)) throw new DomainParseError(`${path}.props must be an object`)
  const props: Record<string, AuthoredPropValue> = {}
  for (const [name, value] of Object.entries(rawProps)) {
    const timingRules: PropRuleMap = TIMING_PROPS
    const rule = rules[name] ?? (CLIP_TAGS.has(nodeTag) ? timingRules[name] : undefined)
    if (rule === undefined) throw new DomainParseError(`${path}.props.${name} is not allowed on ${nodeTag}`)
    if (rule.type === 'string') props[name] = parseStringProp(rule, value, `${path}.props.${name}`)
    else if (rule.type === 'number') props[name] = parseNumberProp(rule, value, `${path}.props.${name}`)
    else props[name] = parseBooleanProp(value, `${path}.props.${name}`)
  }
  for (const [name, rule] of Object.entries(rules)) {
    if (rule.optional !== true && !(name in props)) {
      throw new DomainParseError(`${path}.props.${name} is required on ${nodeTag}`)
    }
  }
  if (nodeTag === 'scene' && props['fill'] === undefined) {
    // Scenes default to a black fill; persisted explicitly so restore is
    // byte-stable.
    props['fill'] = '#000000'
  }

  const rawText = raw['text']
  let text: string | null = null
  if (rawText !== undefined && rawText !== null) {
    if (nodeTag !== 'text') throw new DomainParseError(`${path}.text is only valid on a text element`)
    text = parseStringProp(STRING(MAX_TEXT_LENGTH), rawText, `${path}.text`)
  }

  const rawChildren = raw['children']
  if (rawChildren === undefined) {
    throw new DomainParseError(`${path}.children is required`)
  }
  if (!isJsonArray(rawChildren)) throw new DomainParseError(`${path}.children must be an array`)
  if (nodeTag === 'solidPaint' && rawChildren.length > 0) {
    throw new DomainParseError(`${path}: a paint element cannot have children`)
  }
  const children = rawChildren.map((child, index) => parseAuthoredNode(child, `${path}.children[${index}]`, depth + 1))

  return { tag: nodeTag, props, text, children }
}

export function parseCompositionDocument(raw: EntityPayload): CompositionDocument {
  if (!isJsonObject(raw)) throw new DomainParseError('composition document must be an object')
  if (raw['schemaVersion'] !== 1) {
    throw new DomainParseError(`unsupported composition schema version: ${String(raw['schemaVersion'])}`)
  }

  const rawStage = raw['stage']
  if (!isJsonObject(rawStage)) throw new DomainParseError('composition stage must be an object')
  const stage: StageSpec = {
    width: parseIntegerProp(NUMBER(16, 7680), rawStage['width'], 'stage.width'),
    height: parseIntegerProp(NUMBER(16, 4320), rawStage['height'], 'stage.height'),
    background: parseStringProp(STRING(16), rawStage['background'] ?? '#161616', 'stage.background'),
  }

  const rawScenes = raw['scenes']
  if (!isJsonArray(rawScenes)) throw new DomainParseError('composition scenes must be an array')
  if (rawScenes.length > 64) throw new DomainParseError('composition has too many scenes')

  nodeBudget = MAX_NODES
  const scenes = rawScenes.map((scene, index) => parseAuthoredNode(scene, `scenes[${index}]`, 0))
  return { schemaVersion: 1, stage, scenes }
}

// ───────────────────────────────────────────────────────────────────────────
// Entity row ingress — the entity store is durable storage this app reads
// back; its rows are parsed once at the boundary before any UI or engine
// state is built from them.
// ───────────────────────────────────────────────────────────────────────────

export function parseProjectRecord(raw: EntityPayload): ProjectRecord {
  if (!isJsonObject(raw)) throw new DomainParseError('video.project must be an object')
  const compositionId = raw['activeCompositionId']
  return {
    title: parseStringProp(STRING(80), raw['title'], 'video.project.title'),
    width: parseIntegerProp(NUMBER(16, 7680), raw['width'], 'video.project.width'),
    height: parseIntegerProp(NUMBER(16, 4320), raw['height'], 'video.project.height'),
    fps: parseIntegerProp(NUMBER(1, 120), raw['fps'], 'video.project.fps'),
    order: parseNumberProp(NUMBER(0, Number.MAX_SAFE_INTEGER), raw['order'], 'video.project.order'),
    activeCompositionId: compositionId === null ? null : parseStringProp(STRING(128), compositionId, 'video.project.activeCompositionId'),
  }
}

export function parseCompositionRecord(raw: EntityPayload): CompositionRecord {
  if (!isJsonObject(raw)) throw new DomainParseError('video.composition must be an object')
  return {
    title: parseStringProp(STRING(80), raw['title'], 'video.composition.title'),
    revision: parseIntegerProp(NUMBER(0, 100_000_000), raw['revision'], 'video.composition.revision'),
    document: parseCompositionDocument(raw['document']),
  }
}

const ASSET_KINDS: readonly AssetKind[] = ['image', 'video', 'audio', 'other']

/** The named kind for `value`, proved by the closed list rather than asserted. */
function assetKindOf(value: string): AssetKind | null {
  for (const kind of ASSET_KINDS) {
    if (kind === value) return kind
  }
  return null
}

export function parseAssetRecord(raw: EntityPayload): AssetRecord {
  if (!isJsonObject(raw)) throw new DomainParseError('video.asset must be an object')
  const rawKind = raw['kind']
  if (!isJsonString(rawKind)) throw new DomainParseError('video.asset.kind must be a string')
  const kind = assetKindOf(rawKind)
  if (kind === null) {
    throw new DomainParseError('video.asset.kind must be one of image, video, audio, other')
  }
  return {
    name: parseStringProp(STRING(200), raw['name'], 'video.asset.name'),
    mimeType: parseStringProp(STRING(100), raw['mimeType'], 'video.asset.mimeType'),
    kind,
    url: parseStringProp(STRING(512), raw['url'], 'video.asset.url'),
    sizeBytes: parseIntegerProp(NUMBER(0, 1_099_511_627_776), raw['sizeBytes'] ?? 0, 'video.asset.sizeBytes'),
  }
}

export function parseAssetFolderRecord(raw: EntityPayload): AssetFolderRecord {
  if (!isJsonObject(raw)) throw new DomainParseError('video.asset-folder must be an object')
  const rawAssetIds = raw['assetIds']
  if (!isJsonArray(rawAssetIds)) throw new DomainParseError('video.asset-folder.assetIds must be an array')
  if (rawAssetIds.length > 500) throw new DomainParseError('video.asset-folder.assetIds exceeds 500 entries')
  const assetIds: string[] = []
  for (const [index, id] of rawAssetIds.entries()) {
    assetIds.push(parseStringProp({ type: 'string', minLength: 1, maxLength: 128 }, id, `video.asset-folder.assetIds[${index}]`))
  }
  return {
    name: parseStringProp({ type: 'string', minLength: 1, maxLength: 80 }, raw['name'], 'video.asset-folder.name'),
    order: parseNumberProp(NUMBER(0, Number.MAX_SAFE_INTEGER), raw['order'], 'video.asset-folder.order'),
    assetIds,
  }
}

const EXPORT_FORMATS: readonly ExportFormat[] = ['mp4', 'webm']
const EXPORT_STATES: readonly ExportJobState[] = ['pending', 'running', 'succeeded', 'failed', 'canceled']

/** The named format for `value`, proved by the closed list rather than asserted. */
function exportFormatOf(value: string): ExportFormat | null {
  for (const format of EXPORT_FORMATS) {
    if (format === value) return format
  }
  return null
}

/** The named state for `value`, proved by the closed list rather than asserted. */
function exportStateOf(value: string): ExportJobState | null {
  for (const state of EXPORT_STATES) {
    if (state === value) return state
  }
  return null
}

export function parseExportJobRecord(raw: EntityPayload): ExportJobRecord {
  if (!isJsonObject(raw)) throw new DomainParseError('video.export-job must be an object')
  const rawFormat = raw['format']
  if (!isJsonString(rawFormat)) throw new DomainParseError('video.export-job.format must be a string')
  const format = exportFormatOf(rawFormat)
  if (format === null) throw new DomainParseError('video.export-job.format must be mp4 or webm')
  const rawState = raw['state']
  if (!isJsonString(rawState)) throw new DomainParseError('video.export-job.state must be a string')
  const state = exportStateOf(rawState)
  if (state === null) throw new DomainParseError('video.export-job.state is not a recognized export state')
  const resultPath = raw['resultPath']
  const resultPublicId = raw['resultPublicId']
  const error = raw['error']
  return {
    format,
    state,
    progress: parseNumberProp(NUMBER(0, 1), raw['progress'], 'video.export-job.progress'),
    compositionId: parseStringProp(STRING(128), raw['compositionId'], 'video.export-job.compositionId'),
    resultPath: resultPath === null || resultPath === undefined ? null : parseStringProp(STRING(512), resultPath, 'video.export-job.resultPath'),
    resultPublicId: resultPublicId === null || resultPublicId === undefined ? null : parseStringProp(STRING(128), resultPublicId, 'video.export-job.resultPublicId'),
    error: error === null || error === undefined ? null : parseStringProp(STRING(400), error, 'video.export-job.error'),
  }
}

export function assetKindForMime(mimeType: string): AssetKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'other'
}
