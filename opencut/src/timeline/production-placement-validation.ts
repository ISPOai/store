import type { AcceptedProductionRevision } from "@/project/production-types";
import { MAX_PRODUCTION_ALIGNMENT_SEGMENTS } from "@/subtitles/production-caption-command";
import type {
	ProductionNarrationInput,
	ProductionPlacementInput,
	ProductionPlacementRefusal,
	ProductionShotPlacementInput,
	ProductionVisualInput,
} from "./types";

const MAX_REFERENCE_LENGTH = 256;
const MAX_MEDIA_NAME_LENGTH = 500;
const MAX_SHOTS = 100;
const MAX_DURATION_SECONDS = 86_400;
const TIME_EPSILON_SECONDS = 1e-7;

export class PlacementValidationError extends Error {
	constructor(
		readonly reason: ProductionPlacementRefusal,
		message: string,
	) {
		super(message);
		this.name = "PlacementValidationError";
	}
}

function assertReference(value: string, label: string): void {
	if (value.trim().length === 0 || value.length > MAX_REFERENCE_LENGTH) {
		throw new PlacementValidationError("input-invalid", `${label} is invalid`);
	}
}

function assertTime(value: number, label: string, allowZero = true): void {
	if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0) ||
		value > MAX_DURATION_SECONDS) {
		throw new PlacementValidationError("invalid-bounds", `${label} is invalid`);
	}
}

function playableDuration({
	sourceDurationSeconds,
	trimStartSeconds,
	trimEndSeconds,
	label,
}: {
	sourceDurationSeconds: number;
	trimStartSeconds: number;
	trimEndSeconds: number;
	label: string;
}): number {
	assertTime(sourceDurationSeconds, `${label} source duration`, false);
	assertTime(trimStartSeconds, `${label} trim start`);
	assertTime(trimEndSeconds, `${label} trim end`);
	const playable = sourceDurationSeconds - trimStartSeconds - trimEndSeconds;
	if (playable <= 0) {
		throw new PlacementValidationError(
			"invalid-bounds",
			`${label} trim removes the entire source`,
		);
	}
	return playable;
}

function validateMedia(
	media: ProductionVisualInput | ProductionNarrationInput,
	label: string,
	stillDurationSeconds?: number,
): number {
	assertReference(media.mediaId, `${label} media ID`);
	assertReference(media.mediaRevision, `${label} media revision`);
	if (media.name.trim().length === 0 || media.name.length > MAX_MEDIA_NAME_LENGTH) {
		throw new PlacementValidationError(
			"input-invalid",
			`${label} media name is invalid`,
		);
	}
	if ("mediaType" in media && media.mediaType === "image") {
		// Still images are duration-free sources. The command schema retains the
		// source-duration field for wire compatibility, but placement derives the
		// visual length from the accepted shot and does not permit image trims.
		assertTime(media.sourceDurationSeconds, `${label} source duration`);
		if (media.trimStartSeconds !== 0 || media.trimEndSeconds !== 0) {
			throw new PlacementValidationError(
				"input-invalid",
				`${label} trims are not supported for still images`,
			);
		}
		if (stillDurationSeconds === undefined) {
			throw new PlacementValidationError("input-invalid", `${label} duration is unavailable`);
		}
		return stillDurationSeconds;
	}
	return playableDuration({
		sourceDurationSeconds: media.sourceDurationSeconds,
		trimStartSeconds: media.trimStartSeconds,
		trimEndSeconds: media.trimEndSeconds,
		label,
	});
}

function validateShot(
	shot: ProductionShotPlacementInput,
	accepted: AcceptedProductionRevision,
): void {
	assertReference(shot.shotId, "Shot ID");
	if (!Number.isSafeInteger(shot.shotRevision) || shot.shotRevision < 1) {
		throw new PlacementValidationError("input-invalid", "Shot revision is invalid");
	}
	assertTime(shot.startSeconds, "Shot start");
	assertTime(shot.durationSeconds, "Shot duration", false);
	const acceptedShot = accepted.shots.find((candidate) => candidate.shotId === shot.shotId);
	if (!acceptedShot || acceptedShot.revision !== shot.shotRevision) {
		throw new PlacementValidationError(
			"accepted-source-mismatch",
			`Shot ${shot.shotId} is not the accepted shot revision`,
		);
	}
	if (!shot.visual && !shot.narration) {
		throw new PlacementValidationError(
			"input-invalid",
			`Shot ${shot.shotId} has no placement`,
		);
	}
	if (shot.visual) {
		const playable = validateMedia(shot.visual, "Visual", shot.durationSeconds);
		if (shot.visual.mediaType === "image" && Math.abs(playable - shot.durationSeconds) > TIME_EPSILON_SECONDS) {
			throw new PlacementValidationError(
				"invalid-bounds",
				"Visual trim does not match the shot duration",
			);
		}
		if (shot.visual.mediaType === "video" && playable > shot.durationSeconds + TIME_EPSILON_SECONDS) {
			throw new PlacementValidationError(
				"invalid-bounds",
				"Video trim does not match the shot duration",
			);
		}
	}
	if (!shot.narration) return;
	const narration = shot.narration;
	const playable = validateMedia(narration, "Narration");
	if (narration.acceptedShotId !== shot.shotId ||
		narration.acceptedShotRevision !== shot.shotRevision ||
		narration.alignment.mediaId !== narration.mediaId ||
		narration.alignment.mediaRevision !== narration.mediaRevision) {
		throw new PlacementValidationError(
			"accepted-source-mismatch",
			`Narration for ${shot.shotId} is bound to another accepted source`,
		);
	}
	assertTime(narration.timelineOffsetSeconds, "Narration timeline offset");
	if (narration.timelineOffsetSeconds + playable >
		shot.durationSeconds + TIME_EPSILON_SECONDS) {
		throw new PlacementValidationError(
			"invalid-bounds",
			"Narration extends beyond its picture",
		);
	}
}

export function validateProductionPlacementInput(
	input: ProductionPlacementInput,
	accepted: AcceptedProductionRevision,
): void {
	assertReference(input.editId, "Edit ID");
	assertReference(input.idempotencyKey, "Idempotency key");
	if (input.expectedRevision.editId !== input.editId ||
		input.acceptedRevision.editId !== input.editId) {
		throw new PlacementValidationError(
			"revision-conflict",
			"Edit references do not target this edit",
		);
	}
	if (input.shots.length === 0 || input.shots.length > MAX_SHOTS) {
		throw new PlacementValidationError(
			"input-invalid",
			`Choose between 1 and ${MAX_SHOTS} shots`,
		);
	}
	const seen = new Set<string>();
	let alignmentCount = 0;
	for (const shot of input.shots) {
		if (seen.has(shot.shotId)) {
			throw new PlacementValidationError(
				"input-invalid",
				`Shot ${shot.shotId} appears twice`,
			);
		}
		seen.add(shot.shotId);
		validateShot(shot, accepted);
		alignmentCount += shot.narration?.alignment.segments.length ?? 0;
	}
	if (alignmentCount > MAX_PRODUCTION_ALIGNMENT_SEGMENTS) {
		throw new PlacementValidationError(
			"invalid-bounds",
			`Placement exceeds ${MAX_PRODUCTION_ALIGNMENT_SEGMENTS} alignment segments`,
		);
	}
}

function canonicalMedia(media: ProductionVisualInput | ProductionNarrationInput) {
	return {
		mediaId: media.mediaId,
		mediaRevision: media.mediaRevision,
		name: media.name,
		sourceDurationSeconds: media.sourceDurationSeconds,
		trimStartSeconds: media.trimStartSeconds,
		trimEndSeconds: media.trimEndSeconds,
	};
}

function canonicalShot(shot: ProductionShotPlacementInput) {
	const narration = shot.narration;
	return {
		shotId: shot.shotId,
		shotRevision: shot.shotRevision,
		startSeconds: shot.startSeconds,
		durationSeconds: shot.durationSeconds,
		visual: shot.visual
			? { ...canonicalMedia(shot.visual), mediaType: shot.visual.mediaType }
			: null,
		narration: narration ? {
			...canonicalMedia(narration),
			acceptedShotId: narration.acceptedShotId,
			acceptedShotRevision: narration.acceptedShotRevision,
			timelineOffsetSeconds: narration.timelineOffsetSeconds,
			alignment: {
				mediaId: narration.alignment.mediaId,
				mediaRevision: narration.alignment.mediaRevision,
				segments: narration.alignment.segments.map(({ text, start, end }) => ({ text, start, end })),
			},
		} : null,
	};
}

export async function digestProductionPlacementRequest(
	input: ProductionPlacementInput,
): Promise<string> {
	const canonical = JSON.stringify({
		editId: input.editId,
		expectedRevision: {
			editId: input.expectedRevision.editId,
			storageCasRevision: input.expectedRevision.storageCasRevision,
			intentRevision: input.expectedRevision.intentRevision,
			digest: input.expectedRevision.digest,
		},
		acceptedRevision: {
			editId: input.acceptedRevision.editId,
			documentIntentRevision: input.acceptedRevision.documentIntentRevision,
			productionRevisionId: input.acceptedRevision.productionRevisionId,
			contentDigest: input.acceptedRevision.contentDigest,
		},
		idempotencyKey: input.idempotencyKey,
		shots: input.shots.map(canonicalShot),
	});
	const result = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(canonical),
	);
	return Array.from(new Uint8Array(result), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}
