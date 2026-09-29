import { buildElementFromMedia } from "@/timeline/element-utils";
import type {
	AudioElement,
	ProductionElementIdentity,
	ProductionNarrationInput,
	ProductionTimelineElementRef,
	ProductionTimelineTrackRef,
	ProductionTrackRole,
	TextElement,
} from "@/timeline/types";
import { DEFAULT_WORDS_PER_CAPTION } from "@/transcription/caption-defaults";
import { buildCaptionChunks } from "@/transcription/caption";
import type {
	CaptionChunk,
	TranscriptionSegment,
} from "@/transcription/types";
import type { SerializedProject, SerializedScene } from "@/services/storage/types";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import { mediaTimeFromSeconds } from "@/wasm";

export const MAX_PRODUCTION_ALIGNMENT_SEGMENTS = 20_000;

const MAX_ALIGNMENT_TEXT_LENGTH = 4_000;
const TIME_EPSILON_SECONDS = 1e-7;
// Provider word timings are rounded to milliseconds; WAV duration is sample-exact.
const ALIGNMENT_ROUNDING_SECONDS = 0.0005;

export class ProductionCaptionBoundsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProductionCaptionBoundsError";
	}
}

function finiteNonNegative(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

function validateTimelineBounds({
	trimStartSeconds,
	playableDurationSeconds,
	timelineStartSeconds,
	shotStartSeconds,
	shotDurationSeconds,
}: {
	trimStartSeconds: number;
	playableDurationSeconds: number;
	timelineStartSeconds: number;
	shotStartSeconds: number;
	shotDurationSeconds: number;
}): void {
	if (
		!finiteNonNegative(trimStartSeconds) ||
		!Number.isFinite(playableDurationSeconds) ||
		playableDurationSeconds <= 0 ||
		!finiteNonNegative(timelineStartSeconds) ||
		!finiteNonNegative(shotStartSeconds) ||
		!Number.isFinite(shotDurationSeconds) ||
		shotDurationSeconds <= 0
	) {
		throw new ProductionCaptionBoundsError("Caption timing contains an invalid bound");
	}
	const shotEnd = shotStartSeconds + shotDurationSeconds;
	const timelineEnd = timelineStartSeconds + playableDurationSeconds;
	if (
		timelineStartSeconds + TIME_EPSILON_SECONDS < shotStartSeconds ||
		timelineEnd > shotEnd + TIME_EPSILON_SECONDS
	) {
		throw new ProductionCaptionBoundsError(
			"Narration alignment maps outside the shot bounds",
		);
	}
}

function validateSegments({
	segments,
	trimStartSeconds,
	playableDurationSeconds,
}: {
	segments: TranscriptionSegment[];
	trimStartSeconds: number;
	playableDurationSeconds: number;
}): void {
	if (segments.length === 0 || segments.length > MAX_PRODUCTION_ALIGNMENT_SEGMENTS) {
		throw new ProductionCaptionBoundsError(
			`Narration alignment exceeds ${MAX_PRODUCTION_ALIGNMENT_SEGMENTS} segments`,
		);
	}
	const sourceEnd = trimStartSeconds + playableDurationSeconds;
	let previousEnd = trimStartSeconds;
	let chunkCount = 0;
	for (const [index, segment] of segments.entries()) {
		if (
			segment.text.trim().length === 0 ||
			segment.text.length > MAX_ALIGNMENT_TEXT_LENGTH
		) {
			throw new ProductionCaptionBoundsError(
				`Narration alignment segment ${index + 1} has invalid text`,
			);
		}
		if (
			!finiteNonNegative(segment.start) ||
			!Number.isFinite(segment.end) ||
			Math.min(segment.end, sourceEnd) <= segment.start ||
			segment.start + TIME_EPSILON_SECONDS < previousEnd ||
			segment.end > sourceEnd + ALIGNMENT_ROUNDING_SECONDS + TIME_EPSILON_SECONDS
		) {
			throw new ProductionCaptionBoundsError(
				`Narration alignment segment ${index + 1} is outside the playable narration bounds`,
			);
		}
		previousEnd = segment.end;
		chunkCount += Math.ceil(segment.text.trim().split(/\s+/).length / DEFAULT_WORDS_PER_CAPTION);
		if (chunkCount > MAX_PRODUCTION_ALIGNMENT_SEGMENTS) {
			throw new ProductionCaptionBoundsError("Narration exceeds the caption chunk limit");
		}
	}
}

export function mapNarrationAlignment({
	segments,
	trimStartSeconds,
	playableDurationSeconds,
	timelineStartSeconds,
	shotStartSeconds,
	shotDurationSeconds,
}: {
	segments: TranscriptionSegment[];
	trimStartSeconds: number;
	playableDurationSeconds: number;
	timelineStartSeconds: number;
	shotStartSeconds: number;
	shotDurationSeconds: number;
}): CaptionChunk[] {
	validateTimelineBounds({
		trimStartSeconds,
		playableDurationSeconds,
		timelineStartSeconds,
		shotStartSeconds,
		shotDurationSeconds,
	});
	validateSegments({ segments, trimStartSeconds, playableDurationSeconds });

	const audioEnd = timelineStartSeconds + playableDurationSeconds;
	const shotEnd = shotStartSeconds + shotDurationSeconds;
	const sourceEnd = trimStartSeconds + playableDurationSeconds;
	const boundedSegments = segments.map((segment) => ({ ...segment, end: Math.min(segment.end, sourceEnd) }));
	return buildCaptionChunks({ segments: boundedSegments, minDuration: 0 }).map((caption, index) => {
		const startTime =
			timelineStartSeconds + caption.startTime - trimStartSeconds;
		const endTime = startTime + caption.duration;
		if (
			startTime + TIME_EPSILON_SECONDS < timelineStartSeconds ||
			endTime > audioEnd + TIME_EPSILON_SECONDS ||
			startTime + TIME_EPSILON_SECONDS < shotStartSeconds ||
			endTime > shotEnd + TIME_EPSILON_SECONDS
		) {
			throw new ProductionCaptionBoundsError(
				`Caption chunk ${index + 1} maps outside the shot bounds`,
			);
		}
		return { ...caption, startTime };
	});
}

interface ProductionNarrationPlacement {
	requestId: string;
	productionRevisionId: string;
	shotId: string;
	shotRevision: number;
	shotStartSeconds: number;
	narration: ProductionNarrationInput;
	project: SerializedProject;
	scene: SerializedScene;
	audioTrackId: string;
	audioElementId: string;
	captionTrackId: string;
	captionElementIds: string[];
	captions: CaptionChunk[];
}

interface ProductionNarrationPlacementResult {
	tracks: ProductionTimelineTrackRef[];
	elements: ProductionTimelineElementRef[];
}

function productionIdentity({
	placement,
	role,
}: {
	placement: ProductionNarrationPlacement;
	role: ProductionTrackRole;
}): ProductionElementIdentity {
	return {
		owner: "opencut-production",
		role,
		requestId: placement.requestId,
		productionRevisionId: placement.productionRevisionId,
		shotId: placement.shotId,
		shotRevision: placement.shotRevision,
		sourceId: placement.narration.mediaId,
		sourceRevision: placement.narration.mediaRevision,
	};
}

function replaceById<T extends { id: string }>(elements: T[], next: T): T[] {
	const index = elements.findIndex((element) => element.id === next.id);
	if (index < 0) return [...elements, next];
	return elements.map((element, current) => current === index ? next : element);
}

function assertOwnedTrack(
	scene: SerializedScene,
	trackId: string,
	role: ProductionTrackRole,
): void {
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const existing = tracks.find((track) => track.id === trackId);
	const lane = role === "narration" ? scene.tracks.audio : scene.tracks.overlay;
	if (existing &&
		(!lane.some((track) => track.id === trackId) ||
			existing.production?.owner !== "opencut-production" ||
			existing.production.role !== role)) {
		throw new ProductionCaptionBoundsError(`Track identity ${trackId} is already in use`);
	}
}

export function assertProductionElementAvailable(
	scene: SerializedScene,
	trackId: string,
	elementId: string,
	role: ProductionTrackRole,
	shotId: string,
): void {
	for (const track of [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]) {
		for (const element of track.elements) {
			if (element.id !== elementId) continue;
			if (track.id !== trackId || element.production?.owner !== "opencut-production" ||
				element.production.role !== role || element.production.shotId !== shotId) {
				throw new ProductionCaptionBoundsError("A placement identity belongs to another timeline element");
			}
		}
	}
}

export function insertProductionNarration(
	placement: ProductionNarrationPlacement,
): ProductionNarrationPlacementResult {
	const { narration, project, scene } = placement;
	assertOwnedTrack(scene, placement.audioTrackId, "narration");
	let audioTrack = scene.tracks.audio.find(
		(track) => track.id === placement.audioTrackId,
	);
	if (!audioTrack) {
		audioTrack = {
			id: placement.audioTrackId,
			name: "Production narration",
			type: "audio",
			elements: [],
			muted: false,
			production: { owner: "opencut-production", role: "narration" },
		};
		scene.tracks.audio.push(audioTrack);
	}
	const playable = narration.sourceDurationSeconds -
		narration.trimStartSeconds - narration.trimEndSeconds;
	const audioStart = placement.shotStartSeconds + narration.timelineOffsetSeconds;
	const audioBase = buildElementFromMedia({
		mediaId: narration.mediaId,
		mediaType: "audio",
		name: narration.name,
		duration: mediaTimeFromSeconds({ seconds: playable }),
		startTime: mediaTimeFromSeconds({ seconds: audioStart }),
	});
	if (audioBase.type !== "audio") {
		throw new ProductionCaptionBoundsError("Narration media type changed");
	}
	const audioElement: AudioElement = {
		...audioBase,
		id: placement.audioElementId,
		sourceDuration: mediaTimeFromSeconds({ seconds: narration.sourceDurationSeconds }),
		trimStart: mediaTimeFromSeconds({ seconds: narration.trimStartSeconds }),
		trimEnd: mediaTimeFromSeconds({ seconds: narration.trimEndSeconds }),
		production: productionIdentity({ placement, role: "narration" }),
	};
	assertProductionElementAvailable(scene, placement.audioTrackId,
		placement.audioElementId, "narration", placement.shotId);
	const priorAudio = audioTrack.elements.find((element) => element.id === placement.audioElementId);
	if (priorAudio) {
		audioElement.params = { ...priorAudio.params };
		if (priorAudio.animations) audioElement.animations = priorAudio.animations;
	}
	audioTrack.elements = replaceById(audioTrack.elements, audioElement);

	assertOwnedTrack(scene, placement.captionTrackId, "caption");
	let captionTrack = scene.tracks.overlay.find(
		(track) => track.id === placement.captionTrackId,
	);
	if (!captionTrack) {
		captionTrack = {
			id: placement.captionTrackId,
			name: "Production captions",
			type: "text",
			elements: [],
			hidden: false,
			production: { owner: "opencut-production", role: "caption" },
		};
		scene.tracks.overlay.push(captionTrack);
	}
	if (captionTrack.type !== "text") {
		throw new ProductionCaptionBoundsError("Caption track type changed");
	}
	// Overlay order is top-to-bottom. Repair older placements as well as new ones
	// so full-frame production visuals cannot paint over their captions.
	const visualIndex = scene.tracks.overlay.findIndex((track) =>
		track.production?.owner === "opencut-production" && track.production.role === "visual",
	);
	const captionIndex = scene.tracks.overlay.indexOf(captionTrack);
	if (visualIndex >= 0 && captionIndex > visualIndex) {
		scene.tracks.overlay.splice(captionIndex, 1);
		scene.tracks.overlay.splice(visualIndex, 0, captionTrack);
	}
	for (const elementId of placement.captionElementIds) {
		assertProductionElementAvailable(scene, placement.captionTrackId,
			elementId, "caption", placement.shotId);
	}
	const priorCaptions = captionTrack.elements.filter((element) =>
		element.production?.owner === "opencut-production" &&
		element.production.role === "caption" && element.production.shotId === placement.shotId,
	);
	captionTrack.elements = captionTrack.elements.filter((element) =>
		element.production?.owner !== "opencut-production" ||
			element.production.role !== "caption" ||
			element.production.shotId !== placement.shotId,
	);
	const elements: ProductionTimelineElementRef[] = [{
		shotId: placement.shotId,
		role: "narration",
		trackId: placement.audioTrackId,
		elementId: placement.audioElementId,
	}];
	for (const [index, caption] of placement.captions.entries()) {
		const elementId = placement.captionElementIds[index];
		if (!elementId) {
			throw new ProductionCaptionBoundsError("Caption identity count changed");
		}
		const element: TextElement = {
			...buildSubtitleTextElement({ index, caption, canvasSize: project.settings.canvasSize }),
			id: elementId,
			production: productionIdentity({ placement, role: "caption" }),
		};
		const priorCaption = priorCaptions.find((prior) => prior.id === elementId) ?? priorCaptions[0];
		if (priorCaption) {
			element.params = { ...priorCaption.params, content: element.params.content };
			if (priorCaption.animations) element.animations = priorCaption.animations;
			if (priorCaption.effects) element.effects = priorCaption.effects;
			if (priorCaption.hidden !== undefined) element.hidden = priorCaption.hidden;
		}
		captionTrack.elements.push(element);
		elements.push({
			shotId: placement.shotId,
			role: "caption",
			trackId: placement.captionTrackId,
			elementId,
		});
	}
	return {
		tracks: [
			{ role: "narration", trackId: placement.audioTrackId },
			{ role: "caption", trackId: placement.captionTrackId },
		],
		elements,
	};
}
