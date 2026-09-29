import type { ElementAnimations } from "@/animation/types";
import type { TextAnimationPresetBinding } from "@/animation/presets";
import type { Effect } from "@/effects/types";
import type { Mask } from "@/masks/types";
import type { ParamValues } from "@/params";
import type { Transition } from "@/transitions";
import type {
	EditRevision,
	ProductionRevisionReference,
} from "@/project/production-types";
import type { MediaTime } from "@/wasm";

export type ElementRef = {
	trackId: string;
	elementId: string;
};

export type ProductionTrackRole = "visual" | "narration" | "caption";

export interface ProductionTrackIdentity {
	owner: "opencut-production";
	role: ProductionTrackRole;
}

export interface ProductionElementIdentity extends ProductionTrackIdentity {
	requestId: string;
	productionRevisionId: string;
	shotId: string;
	shotRevision: number;
	sourceId: string;
	sourceRevision: string;
}

export interface ProductionTimelineElementRef {
	shotId: string;
	role: ProductionTrackRole;
	trackId: string;
	elementId: string;
}

export interface ProductionTimelineTrackRef {
	role: ProductionTrackRole;
	trackId: string;
}

export interface ProductionPlacementReceipt {
	idempotencyKey: string;
	requestDigest: string;
	expectedIntentRevision: string;
	documentIntentRevision: string;
	tracks: ProductionTimelineTrackRef[];
	elements: ProductionTimelineElementRef[];
}

export interface ProductionVisualInput {
	mediaId: string;
	mediaRevision: string;
	mediaType: "image" | "video";
	name: string;
	sourceDurationSeconds: number;
	trimStartSeconds: number;
	trimEndSeconds: number;
}

export interface ProductionNarrationInput {
	mediaId: string;
	mediaRevision: string;
	acceptedShotId: string;
	acceptedShotRevision: number;
	name: string;
	sourceDurationSeconds: number;
	trimStartSeconds: number;
	trimEndSeconds: number;
	timelineOffsetSeconds: number;
	alignment: {
		mediaId: string;
		mediaRevision: string;
		segments: Array<{ text: string; start: number; end: number }>;
	};
}

export interface ProductionShotPlacementInput {
	shotId: string;
	shotRevision: number;
	startSeconds: number;
	durationSeconds: number;
	visual?: ProductionVisualInput;
	narration?: ProductionNarrationInput;
}

export interface ProductionPlacementInput {
	editId: string;
	expectedRevision: EditRevision;
	acceptedRevision: ProductionRevisionReference;
	idempotencyKey: string;
	shots: ProductionShotPlacementInput[];
}

export type ProductionPlacementRefusal =
	| "accepted-source-mismatch"
	| "edit-not-found"
	| "idempotency-reused"
	| "input-invalid"
	| "invalid-bounds"
	| "legacy-revision-required"
	| "revision-conflict";

interface ProductionPlacementCompletedData {
	status: "completed";
	editId: string;
	message: string;
	revision: EditRevision;
	elements: ProductionTimelineElementRef[];
}

interface ProductionPlacementRefusedData {
	status: "refused";
	editId: string;
	message: string;
	reason: ProductionPlacementRefusal;
	revision?: EditRevision;
}

export interface ProductionPlacementResult {
	kind: "json";
	data: ProductionPlacementCompletedData | ProductionPlacementRefusedData;
}

export interface Bookmark {
	time: MediaTime;
	note?: string;
	color?: string;
	duration?: MediaTime;
}

export interface TScene {
	id: string;
	name: string;
	isMain: boolean;
	tracks: SceneTracks;
	bookmarks: Bookmark[];
	productionPlacementReceipts?: ProductionPlacementReceipt[];
	createdAt: Date;
	updatedAt: Date;
}

export type TrackType = "video" | "text" | "audio" | "graphic" | "effect";

interface BaseTrack {
	id: string;
	name: string;
	production?: ProductionTrackIdentity;
}

export interface VideoTrack extends BaseTrack {
	type: "video";
	elements: (VideoElement | ImageElement)[];
	muted: boolean;
	hidden: boolean;
}

export interface TextTrack extends BaseTrack {
	type: "text";
	elements: TextElement[];
	hidden: boolean;
}

export interface AudioTrack extends BaseTrack {
	type: "audio";
	elements: AudioElement[];
	muted: boolean;
}

export interface GraphicTrack extends BaseTrack {
	type: "graphic";
	elements: (StickerElement | GraphicElement)[];
	hidden: boolean;
}

export interface EffectTrack extends BaseTrack {
	type: "effect";
	elements: EffectElement[];
	hidden: boolean;
}

export type TimelineTrack =
	| VideoTrack
	| TextTrack
	| AudioTrack
	| GraphicTrack
	| EffectTrack;

export type OverlayTrack = VideoTrack | TextTrack | GraphicTrack | EffectTrack;

export interface SceneTracks {
	overlay: OverlayTrack[];
	main: VideoTrack;
	audio: AudioTrack[];
}

export type SpeedCurveSegmentType = "step" | "linear" | "bezier";

export interface SpeedCurveHandle {
	/** Offset in normalized clip time [0,1]. May be negative for an incoming handle. */
	dt: number;
	/** Offset in rate-multiplier units. */
	dv: number;
}

export interface SpeedCurveKeyframe {
	id: string;
	/** Normalized position along the clip, in [0,1]. */
	time: number;
	/** Playback-rate multiplier at this position (> 0). */
	rate: number;
	leftHandle?: SpeedCurveHandle;
	rightHandle?: SpeedCurveHandle;
	segmentToNext: SpeedCurveSegmentType;
}

export interface RetimeConfig {
	rate: number;
	maintainPitch?: boolean;
	/**
	 * Optional velocity ramp. When present, the source time at clip time `t` is
	 * the integral of the rate curve over `[0, t / clipDuration]`, scaled by the
	 * clip duration. `rate` remains the fallback constant rate.
	 */
	curve?: SpeedCurveKeyframe[];
}

interface BaseAudioElement extends BaseTimelineElement {
	type: "audio";
	buffer?: AudioBuffer;
	retime?: RetimeConfig;
}

export interface UploadAudioElement extends BaseAudioElement {
	sourceType: "upload";
	mediaId: string;
}

export interface LibraryAudioElement extends BaseAudioElement {
	sourceType: "library";
	sourceUrl: string;
}

export type AudioElement = UploadAudioElement | LibraryAudioElement;

interface BaseTimelineElement {
	id: string;
	name: string;
	duration: MediaTime;
	startTime: MediaTime;
	trimStart: MediaTime;
	trimEnd: MediaTime;
	sourceDuration?: MediaTime;
	animations?: ElementAnimations;
	params: ParamValues;
	production?: ProductionElementIdentity;
}

export interface VideoElement extends BaseTimelineElement {
	type: "video";
	mediaId: string;
	isSourceAudioEnabled?: boolean;
	hidden?: boolean;
	retime?: RetimeConfig;
	effects?: Effect[];
	masks?: Mask[];
	/** Transition at this element's start edge (composites from the previous main-track element). */
	transitionIn?: Transition;
	/** Transition at this element's end edge (composites into the next main-track element). */
	transitionOut?: Transition;
}

export interface ImageElement extends BaseTimelineElement {
	type: "image";
	mediaId: string;
	/** Production stills cover the accepted canvas; ordinary images retain contain behavior. */
	fit?: "cover" | "contain";
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
	/** Transition at this element's start edge (composites from the previous main-track element). */
	transitionIn?: Transition;
	/** Transition at this element's end edge (composites into the next main-track element). */
	transitionOut?: Transition;
}

export interface TextElement extends BaseTimelineElement {
	type: "text";
	hidden?: boolean;
	effects?: Effect[];
	/** Applied entrance animation preset; keyframes are expanded into `animations`. */
	textAnimationIn?: TextAnimationPresetBinding;
	/** Applied exit animation preset; keyframes are expanded into `animations`. */
	textAnimationOut?: TextAnimationPresetBinding;
	/** Applied looping animation preset; keyframes are expanded into `animations`. */
	textAnimationLoop?: TextAnimationPresetBinding;
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	/** Natural dimensions of the sticker asset, stored at insert time. Used by renderer and preview bounds to avoid split-brain geometry. */
	intrinsicWidth?: number;
	intrinsicHeight?: number;
	hidden?: boolean;
	effects?: Effect[];
}

export interface GraphicElement extends BaseTimelineElement {
	type: "graphic";
	definitionId: string;
	hidden?: boolean;
	effects?: Effect[];
	masks?: Mask[];
}

export interface EffectElement extends BaseTimelineElement {
	type: "effect";
	effectType: string;
}

export type ElementUpdatePatch = { params?: Partial<ParamValues> };

export type TimelineElement =
	| AudioElement
	| VideoElement
	| ImageElement
	| TextElement
	| StickerElement
	| GraphicElement
	| EffectElement;

export type ElementType = TimelineElement["type"];

function elementTypes<T extends ElementType[]>(...types: T): T {
	return types;
}

export const MASKABLE_ELEMENT_TYPES = elementTypes("video", "image", "graphic");

export type MaskableElement = Extract<
	TimelineElement,
	{ type: (typeof MASKABLE_ELEMENT_TYPES)[number] }
>;

export const RETIMABLE_ELEMENT_TYPES = elementTypes("video", "audio");

export type RetimableElement = Extract<
	TimelineElement,
	{ type: (typeof RETIMABLE_ELEMENT_TYPES)[number] }
>;

export const VISUAL_ELEMENT_TYPES = elementTypes(
	"video",
	"image",
	"text",
	"sticker",
	"graphic",
);

export type VisualElement = Extract<
	TimelineElement,
	{ type: (typeof VISUAL_ELEMENT_TYPES)[number] }
>;

export type CreateUploadAudioElement = Omit<UploadAudioElement, "id">;
export type CreateLibraryAudioElement = Omit<LibraryAudioElement, "id">;
export type CreateAudioElement =
	| CreateUploadAudioElement
	| CreateLibraryAudioElement;
export type CreateVideoElement = Omit<VideoElement, "id">;
export type CreateImageElement = Omit<ImageElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateGraphicElement = Omit<GraphicElement, "id">;
export type CreateEffectElement = Omit<EffectElement, "id">;
export type CreateTimelineElement =
	| CreateAudioElement
	| CreateVideoElement
	| CreateImageElement
	| CreateTextElement
	| CreateStickerElement
	| CreateGraphicElement
	| CreateEffectElement;

export interface ElementDragState {
	isDragging: boolean;
	elementId: string | null;
	dragElementIds: string[];
	dragTimeOffsets: Record<string, MediaTime>;
	trackId: string | null;
	startMouseX: number;
	startMouseY: number;
	startElementTime: MediaTime;
	clickOffsetTime: MediaTime;
	currentTime: MediaTime;
	currentMouseY: number;
}

export type ElementDragView =
	| { readonly kind: "idle" }
	| {
			readonly kind: "dragging";
			readonly anchorElementId: string;
			readonly trackId: string;
			readonly memberTimeOffsets: ReadonlyMap<string, MediaTime>;
			readonly startMouseX: number;
			readonly startMouseY: number;
			readonly startElementTime: MediaTime;
			readonly clickOffsetTime: MediaTime;
			readonly currentTime: MediaTime;
			readonly currentMouseX: number;
			readonly currentMouseY: number;
			readonly dropTarget: DropTarget | null;
	  };

export interface DropTarget {
	trackIndex: number;
	isNewTrack: boolean;
	insertPosition: "above" | "below" | null;
	xPosition: MediaTime;
	targetElement: { elementId: string; trackId: string } | null;
}

export interface ComputeDropTargetParams {
	elementType: ElementType;
	mouseX: number;
	mouseY: number;
	tracks: SceneTracks;
	playheadTime: MediaTime;
	isExternalDrop: boolean;
	elementDuration: MediaTime;
	pixelsPerSecond: number;
	zoomLevel: number;
	verticalDragDirection?: "up" | "down" | null;
	startTimeOverride?: MediaTime;
	excludeElementId?: string;
	targetElementTypes?: string[];
}

export interface ClipboardItem {
	trackId: string;
	trackType: TrackType;
	element: CreateTimelineElement;
}
