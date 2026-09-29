import {
	insertProductionNarration,
	assertProductionElementAvailable,
	ProductionCaptionBoundsError,
	mapNarrationAlignment,
	MAX_PRODUCTION_ALIGNMENT_SEGMENTS,
} from "@/subtitles/production-caption-command";
import type { ProductionDocumentSdk } from "@/project/production-document-service";
import { ProductionDocumentService } from "@/project/production-document-service";
import type {
	LoadedProductionDocument,
	ProductionRevisionReference,
} from "@/project/production-types";
import { EditRevisionConflictError } from "@/project/production-types";
import type { SerializedProject, SerializedScene } from "@/services/storage/types";
import {
	digestProductionPlacementRequest,
	PlacementValidationError,
	validateProductionPlacementInput,
} from "./production-placement-validation";
import { buildElementFromMedia } from "./element-utils";
import type {
	ProductionElementIdentity,
	ProductionPlacementInput,
	ProductionPlacementReceipt,
	ProductionPlacementRefusal,
	ProductionPlacementResult,
	ProductionShotPlacementInput,
	ProductionTimelineElementRef,
	ProductionTimelineTrackRef,
	ProductionTrackRole,
	TimelineElement,
	VideoElement,
	ImageElement,
} from "./types";
import { mediaTime, mediaTimeFromSeconds } from "@/wasm";

const MAX_RECEIPTS = 1_000;

type ProductionDocuments = Pick<
	ProductionDocumentService,
	"readCurrent" | "readRevision" | "save"
>;

class PlacementInputError extends Error {
	constructor(
		readonly reason: ProductionPlacementRefusal,
		message: string,
	) {
		super(message);
		this.name = "PlacementInputError";
	}
}

function sameRevision(
	left: ProductionPlacementInput["expectedRevision"],
	right: ProductionPlacementInput["expectedRevision"],
): boolean {
	return left.editId === right.editId &&
		left.intentRevision === right.intentRevision && left.digest === right.digest;
}

function sameAcceptedReference(
	left: ProductionRevisionReference,
	right: ProductionRevisionReference,
): boolean {
	return left.editId === right.editId &&
		left.documentIntentRevision === right.documentIntentRevision &&
		left.productionRevisionId === right.productionRevisionId &&
		left.contentDigest === right.contentDigest;
}

function canonicalInteger(value: string): number | null {
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 && String(number) === value
		? number
		: null;
}

function isImmediateSuccessor(current: string, expected: string): boolean {
	const currentNumber = canonicalInteger(current);
	const expectedNumber = canonicalInteger(expected);
	return currentNumber !== null && expectedNumber !== null &&
		currentNumber === expectedNumber + 1;
}

function allTracks(scene: SerializedScene) {
	return [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
}

async function stableId(prefix: string, ...parts: string[]): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(parts));
	const result = await crypto.subtle.digest("SHA-256", bytes);
	const hex = Array.from(new Uint8Array(result), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	return `${prefix}-${hex.slice(0, 24)}`;
}

async function trackId(editId: string, role: ProductionTrackRole): Promise<string> {
	return stableId("production-track", editId, role);
}

function assertTrackAvailable(
	scene: SerializedScene,
	id: string,
	role: ProductionTrackRole,
): void {
	const existing = allTracks(scene).find((track) => track.id === id);
	if (existing &&
		(!scene.tracks.overlay.some((track) => track.id === id) ||
			existing.production?.owner !== "opencut-production" ||
			existing.production.role !== role)) {
		throw new PlacementInputError("input-invalid", `Track identity ${id} is already in use`);
	}
}

function elementIdentity({
	input,
	shot,
	role,
	sourceId,
	sourceRevision,
}: {
	input: ProductionPlacementInput;
	shot: ProductionShotPlacementInput;
	role: ProductionTrackRole;
	sourceId: string;
	sourceRevision: string;
}): ProductionElementIdentity {
	return {
		owner: "opencut-production",
		role,
		requestId: input.idempotencyKey,
		productionRevisionId: input.acceptedRevision.productionRevisionId,
		shotId: shot.shotId,
		shotRevision: shot.shotRevision,
		sourceId,
		sourceRevision,
	};
}

function replaceElement<T extends TimelineElement>(elements: T[], next: T): T[] {
	const index = elements.findIndex((element) => element.id === next.id);
	if (index < 0) return [...elements, next];
	return elements.map((element, current) => current === index ? next : element);
}

function timelineDuration(project: SerializedProject): number {
	let end = 0;
	for (const scene of project.scenes) {
		for (const track of allTracks(scene)) {
			for (const element of track.elements) {
				end = Math.max(end, element.startTime + element.duration);
			}
		}
	}
	return end;
}

function refused(
	input: ProductionPlacementInput,
	reason: ProductionPlacementRefusal,
	message: string,
	revision?: ProductionPlacementInput["expectedRevision"],
): ProductionPlacementResult {
	if (revision) {
		return {
			kind: "json",
			data: {
				status: "refused",
				editId: input.editId,
				message,
				reason,
				revision,
			},
		};
	}
	return {
		kind: "json",
		data: {
			status: "refused",
			editId: input.editId,
			message,
			reason,
		},
	};
}

function completed(
	input: ProductionPlacementInput,
	document: LoadedProductionDocument,
	receipt: ProductionPlacementReceipt,
): ProductionPlacementResult {
	return {
		kind: "json",
		data: {
			status: "completed",
			editId: input.editId,
			message: `Placed ${receipt.elements.length} timeline elements.`,
			revision: document.revision,
			elements: structuredClone(receipt.elements),
		},
	};
}

export class ProductionPlacementService {
	constructor(
		private readonly documents: ProductionDocuments = new ProductionDocumentService(),
	) {}

	async run(input: ProductionPlacementInput): Promise<ProductionPlacementResult> {
		if (input.expectedRevision.editId !== input.editId ||
			input.acceptedRevision.editId !== input.editId) {
			return refused(input, "revision-conflict", "Edit references do not target this edit");
		}
		const current = await this.documents.readCurrent(input.editId);
		if (!current) return refused(input, "edit-not-found", `Edit ${input.editId} was not found`);
		if (current.kind === "legacy") {
			return refused(input, "legacy-revision-required", "Admit an edit revision before placement");
		}
		const document = current.document;
		const scene = document.project.scenes.find((candidate) => candidate.isMain);
		if (!scene) return refused(input, "input-invalid", "The edit has no main scene", document.revision);
		const requestDigest = await digestProductionPlacementRequest(input);
		const existing = scene.productionPlacementReceipts?.find(
			(receipt) => receipt.idempotencyKey === input.idempotencyKey,
		);
		if (existing) {
			if (existing.requestDigest !== requestDigest) {
				return refused(input, "idempotency-reused", "The idempotency key names different placement input", document.revision);
			}
			const historical = await this.documents.readRevision({
				editId: input.editId,
				intentRevision: input.expectedRevision.intentRevision,
			});
			if (historical && historical.revision.digest === input.expectedRevision.digest &&
				existing.expectedIntentRevision === input.expectedRevision.intentRevision &&
				existing.documentIntentRevision === document.revision.intentRevision &&
				isImmediateSuccessor(document.revision.intentRevision, input.expectedRevision.intentRevision) &&
				isImmediateSuccessor(
					document.revision.storageCasRevision,
					input.expectedRevision.storageCasRevision,
				)) {
				const latest = await this.documents.readCurrent(input.editId);
				if (latest?.kind === "document" &&
					sameRevision(latest.document.revision, document.revision)) {
					return completed(input, latest.document, existing);
				}
			}
			return refused(input, "revision-conflict", "The accepted placement is no longer the current edit revision", document.revision);
		}
		if (!sameRevision(document.revision, input.expectedRevision)) {
			return refused(input, "revision-conflict", "The edit changed before placement", document.revision);
		}
		const accepted = document.project.settings.production?.accepted;
		if (!accepted || !sameAcceptedReference(accepted.reference, input.acceptedRevision)) {
			return refused(input, "accepted-source-mismatch", "The accepted production revision changed", document.revision);
		}
		try {
			validateProductionPlacementInput(input, accepted);
			return await this.commit({ input, document, requestDigest });
		} catch (error) {
			if (error instanceof PlacementInputError ||
				error instanceof PlacementValidationError) {
				return refused(input, error.reason, error.message, document.revision);
			}
			if (error instanceof ProductionCaptionBoundsError) {
				return refused(input, "invalid-bounds", error.message, document.revision);
			}
			throw error;
		}
	}

	private async commit({
		input,
		document,
		requestDigest,
	}: {
		input: ProductionPlacementInput;
		document: LoadedProductionDocument;
		requestDigest: string;
	}): Promise<ProductionPlacementResult> {
		const project = structuredClone(document.project);
		const scene = project.scenes.find((candidate) => candidate.isMain);
		if (!scene) throw new PlacementInputError("input-invalid", "The edit has no main scene");
		const receiptCount = scene.productionPlacementReceipts?.length ?? 0;
		if (receiptCount >= MAX_RECEIPTS) {
			throw new PlacementInputError("input-invalid", "The placement receipt limit was reached");
		}
		const tracks: ProductionTimelineTrackRef[] = [];
		const elements: ProductionTimelineElementRef[] = [];
		for (const shot of input.shots) {
			await this.placeShot({ input, shot, project, scene, tracks, elements });
			if (elements.length > MAX_PRODUCTION_ALIGNMENT_SEGMENTS + input.shots.length * 2) {
				throw new PlacementInputError("invalid-bounds", "Placement exceeds the caption result limit");
			}
		}
		const currentIntent = canonicalInteger(document.revision.intentRevision);
		if (currentIntent === null) {
			throw new PlacementInputError("input-invalid", "The edit revision is not supported");
		}
		const receipt: ProductionPlacementReceipt = {
			idempotencyKey: input.idempotencyKey,
			requestDigest,
			expectedIntentRevision: document.revision.intentRevision,
			documentIntentRevision: String(currentIntent + 1),
			tracks,
			elements,
		};
		scene.productionPlacementReceipts = [
			...(scene.productionPlacementReceipts ?? []),
			receipt,
		];
		project.metadata.duration = mediaTime({ ticks: timelineDuration(project) });
		let saved: LoadedProductionDocument;
		try {
			saved = await this.documents.save({
				editId: input.editId,
				project,
				expectedRevision: document.revision,
			});
		} catch (error) {
			if (!(error instanceof EditRevisionConflictError)) throw error;
			return refused(input, "revision-conflict", error.message, error.actual);
		}
		const readback = await this.documents.readCurrent(input.editId);
		if (!readback || readback.kind !== "document" ||
			!sameRevision(readback.document.revision, saved.revision)) {
			throw new Error(`Committed placement for ${input.editId} could not be read back`);
		}
		const readbackScene = readback.document.project.scenes.find((candidate) => candidate.isMain);
		const storedReceipt = readbackScene?.productionPlacementReceipts?.find(
			(candidate) => candidate.idempotencyKey === input.idempotencyKey &&
				candidate.requestDigest === requestDigest,
		);
		if (!storedReceipt) throw new Error(`Committed placement receipt for ${input.editId} is missing`);
		return completed(input, readback.document, storedReceipt);
	}

	private async placeShot({
		input,
		shot,
		project,
		scene,
		tracks,
		elements,
	}: {
		input: ProductionPlacementInput;
		shot: ProductionShotPlacementInput;
		project: SerializedProject;
		scene: SerializedScene;
		tracks: ProductionTimelineTrackRef[];
		elements: ProductionTimelineElementRef[];
	}): Promise<void> {
		if (shot.visual) {
			const id = await trackId(input.editId, "visual");
			assertTrackAvailable(scene, id, "visual");
			let track = scene.tracks.overlay.find((candidate) => candidate.id === id);
			if (!track) {
				track = { id, name: "Production visuals", type: "video", elements: [], muted: true, hidden: false,
					production: { owner: "opencut-production", role: "visual" } };
				scene.tracks.overlay.push(track);
			}
			if (track.type !== "video") throw new PlacementInputError("input-invalid", "Visual track type changed");
			const elementId = await stableId("production-clip", input.editId, shot.shotId, "visual");
			const base = buildElementFromMedia({
				mediaId: shot.visual.mediaId,
				mediaType: shot.visual.mediaType,
				name: shot.visual.name,
				duration: mediaTimeFromSeconds({ seconds: shot.durationSeconds }),
				startTime: mediaTimeFromSeconds({ seconds: shot.startSeconds }),
			});
			if (base.type !== "video" && base.type !== "image") {
				throw new PlacementInputError("input-invalid", "Visual media type changed");
			}
			const common = {
				id: elementId,
				sourceDuration: mediaTimeFromSeconds({
					seconds: shot.visual.mediaType === "image"
						? shot.durationSeconds
						: shot.visual.sourceDurationSeconds,
				}),
				trimStart: mediaTimeFromSeconds({
					seconds: shot.visual.mediaType === "image" ? 0 : shot.visual.trimStartSeconds,
				}),
				trimEnd: mediaTimeFromSeconds({
					seconds: shot.visual.mediaType === "image" ? 0 : shot.visual.trimEndSeconds,
				}),
				production: elementIdentity({
					input,
					shot,
					role: "visual",
					sourceId: shot.visual.mediaId,
					sourceRevision: shot.visual.mediaRevision,
				}),
			};
			let element: VideoElement | ImageElement;
			if (base.type === "video") {
				element = { ...base, ...common, isSourceAudioEnabled: false };
			} else {
				element = { ...base, ...common, fit: "cover" };
			}
			assertProductionElementAvailable(scene, id, elementId, "visual", shot.shotId);
			track.elements = replaceElement(track.elements, element);
			this.recordRef({ shotId: shot.shotId, role: "visual", trackId: id, elementId }, tracks, elements);
		}
		if (!shot.narration) return;
		const narration = shot.narration;
		const audioTrackId = await trackId(input.editId, "narration");
		const playable = narration.sourceDurationSeconds - narration.trimStartSeconds - narration.trimEndSeconds;
		const audioStart = shot.startSeconds + narration.timelineOffsetSeconds;
		const audioElementId = await stableId("production-clip", input.editId, shot.shotId, "narration");
		const captionTrackId = await trackId(input.editId, "caption");
		const captions = mapNarrationAlignment({
			segments: narration.alignment.segments,
			trimStartSeconds: narration.trimStartSeconds,
			playableDurationSeconds: playable,
			timelineStartSeconds: audioStart,
			shotStartSeconds: shot.startSeconds,
			shotDurationSeconds: shot.durationSeconds,
		});
		const captionElementIds = await Promise.all(captions.map((_caption, index) =>
			stableId("production-caption", input.editId, shot.shotId, String(index)),
		));
		const placed = insertProductionNarration({
			requestId: input.idempotencyKey,
			productionRevisionId: input.acceptedRevision.productionRevisionId,
			shotId: shot.shotId,
			shotRevision: shot.shotRevision,
			shotStartSeconds: shot.startSeconds,
			narration,
			project,
			scene,
			audioTrackId,
			audioElementId,
			captionTrackId,
			captionElementIds,
			captions,
		});
		for (const ref of placed.elements) {
			this.recordRef(ref, tracks, elements);
		}
	}

	private recordRef(
		ref: ProductionTimelineElementRef,
		tracks: ProductionTimelineTrackRef[],
		elements: ProductionTimelineElementRef[],
	): void {
		if (!tracks.some((track) => track.trackId === ref.trackId)) {
			tracks.push({ role: ref.role, trackId: ref.trackId });
		}
		elements.push(ref);
	}
}

export function runProductionPlacement(
	input: ProductionPlacementInput,
	sdk: ProductionDocumentSdk,
): Promise<ProductionPlacementResult> {
	return new ProductionPlacementService(new ProductionDocumentService(sdk)).run(input);
}

export type {
	ProductionPlacementInput,
	ProductionPlacementResult,
	ProductionShotPlacementInput,
} from "./types";
