import type {
	EditRevision,
	ProductionImageReferenceSelection,
	ProductionStyleAnchorInput,
} from "@/project/production-types";

/**
 * Command JSON keeps every revision component lossless and portable as a
 * string. Domain services may use numeric shot counters internally, but they
 * must be converted at the command boundary.
 */
export type CommandEditRevision = EditRevision;

export interface CommandProductionRevisionReference {
	editId: string;
	documentIntentRevision: string;
	productionRevisionId: string;
	contentDigest: string;
}

export interface ProductionImageModelPin {
	modelKey: string;
	modelVersion: string;
}

export function canonicalEditRevision(value: {
	editId: string;
	storageCasRevision: string | number;
	intentRevision: string | number;
	digest: string;
}): CommandEditRevision {
	return {
		editId: value.editId,
		storageCasRevision: String(value.storageCasRevision),
		intentRevision: String(value.intentRevision),
		digest: value.digest,
	};
}

export function canonicalProductionRevisionReference(
	value: {
		editId: string;
		documentIntentRevision: string | number;
		productionRevisionId: string;
		contentDigest: string;
	},
): CommandProductionRevisionReference {
	return {
		editId: value.editId,
		documentIntentRevision: String(value.documentIntentRevision),
		productionRevisionId: value.productionRevisionId,
		contentDigest: value.contentDigest,
	};
}

export interface TranscribeMediaInput {
	mediaName?: string;
	language?: string;
}

export interface TranscribeMediaResult {
	kind: "json";
	data: {
		text: string;
		language: string;
		segments: Array<{ start: number; end: number; text: string }>;
		segmentsTruncated?: boolean;
	};
}

export interface CreateProjectInput {
	name?: string;
}

export interface CreateProjectResult {
	kind: "json";
	data: { projectId: string; name: string };
}

export interface ArrangeTimelineInput {
	items: Array<{
		mediaId?: string;
		mediaName?: string;
		durationSeconds?: number;
	}>;
	atSeconds?: number;
}

export interface ArrangeTimelineResult {
	kind: "json";
	data: {
		elements: Array<{
			name: string;
			type: string;
			startSeconds: number;
			durationSeconds: number;
		}>;
		timelineEndSeconds: number;
	};
}

export interface ExportProjectInput {
	editId: string;
	expectedRevision: CommandEditRevision;
	format?: "mp4" | "webm" | "mov" | "gif" | "mp3" | "wav";
	quality?: "low" | "medium" | "high" | "very_high";
	includeAudio?: boolean;
	name?: string;
	resolution?: { width: number; height: number };
	fps?: number;
	bitrate?: number;
	movCodec?: "h264" | "prores";
}

export interface ExportProjectResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "refused";
		operation: "export-project";
		editId: string;
		message: string;
		reason?: string;
		revision?: CommandEditRevision;
		operationId?: string;
		artifact?: {
			publicId: string;
			path: string;
			byteLength: number;
			sha256: string;
			duration: number;
			width: number;
			height: number;
			format: "mp4" | "webm" | "mov" | "gif" | "mp3" | "wav";
		};
	};
}

export interface ProductionImageInput {
	editId: string;
	expectedRevision: CommandEditRevision;
	acceptedRevision: CommandProductionRevisionReference;
	shotIds: string[];
	attempt: number;
	newVersion?: boolean;
	visualBrief?: string;
	model?: ProductionImageModelPin;
	strength?: number;
	references?: ProductionImageReferenceSelection;
	styleAnchor?: ProductionStyleAnchorInput;
}

export type ProductionNarrationVoice =
	| "neutral"
	| "warm"
	| "authoritative"
	| "conversational";

export interface ProductionNarrationInput {
	editId: string;
	expectedRevision: CommandEditRevision;
	acceptedRevision: CommandProductionRevisionReference;
	shotIds: string[];
	attempt: number;
	newVersion?: boolean;
	voice: ProductionNarrationVoice;
}

export interface ProductionImportInput {
	editId: string;
	expectedRevision: CommandEditRevision;
	acceptedRevision: CommandProductionRevisionReference;
	shotId: string;
	shotRevision: number | string;
	role: "visual" | "video" | "narration";
	idempotencyKey: string;
	name?: string;
	durationMs?: number;
	voiceboxGenerationRef?: string;
	publishedFiles?: { publicId: string; path?: string; revision?: string };
	sourcePublicId?: string;
	alignment?: Array<{ text: string; start: number; end: number }>;
}

export interface ProductionImportCommandInput extends Omit<ProductionImportInput, "shotRevision"> {
	shotRevision: string;
}

export interface ProductionMediaCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "pending" | "refused";
		operation: "production-image" | "production-narration" | "production-import";
		editId: string;
		message: string;
		reason?: "capability-unavailable" | "edit-not-found" | "expected-revision-required" | "input-invalid" | "legacy-revision-required" | "revision-conflict" | "render-failed" | "accepted-source-mismatch" | "producer-failed" | "producer-timeout";
		revision?: CommandEditRevision;
		/** Host P09's durable operation reference when that owner is available. */
		operationId?: string;
		shots?: Array<{ shotId: string; publicId: string; path: string; digest: string; mediaId?: string; mediaRevision?: string; durationMs?: number; references?: Array<{ name: string }>; styleAnchorRevision?: string }>;
		media?: { mediaId: string; mediaRevision: string; shotId: string; role: "visual" | "video" | "narration"; durationMs: number };
		filesRef?: { publicId: string; path?: string };
	};
}

export interface ProductionImportCommandResult {
	kind: "json";
	data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "filesRef"> & {
		operation: "production-import";
		editId: string;
		filesRef: { publicId: string; path?: string };
	};
}

export interface ProductionMediaVersionView {
 model?: { modelKey: string; modelVersion: string };
	versionId: string;
	mediaId: string;
	mediaRevision: string;
	name: string;
	mediaType: "image" | "video" | "audio";
	filesRef?: { publicId: string; path?: string; revision?: string };
	dimensions?: { width: number; height: number };
	durationSeconds?: number;
	references?: Array<{ name: string }>;
	styleAnchorRevision?: string;
}

export interface ProductionMediaListItem {
	shotId: string;
	shotRevision: string;
	role: "visual" | "narration";
	accepted?: ProductionMediaVersionView;
	candidates: Array<ProductionMediaVersionView & { candidateId: string }>;
}

export interface ProductionListMediaCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "refused";
		operation: "list-media";
		editId: string;
		message: string;
		reason?: "edit-not-found" | "legacy-revision-required";
		revision?: CommandEditRevision;
		legacyStorageCasRevision?: string;
		media: ProductionMediaListItem[];
	};
}

export interface ProductionScriptInput {
	operation: "read" | "save-draft" | "accept";
	editId?: string;
	expectedRevision?: CommandEditRevision;
	script?: string;
	shots?: Array<{
		shotId?: string;
		narration: string;
		visualBrief: string;
		motionBrief?: string;
		targetDurationSeconds: number;
	}>;
	idempotencyKey?: string;
}

export interface ProductionScriptView {
	script: string;
	shots: Array<{
		shotId: string;
		revision?: string;
		narration: string;
		visualBrief: string;
		motionBrief: string;
		targetDurationSeconds: number;
	}>;
	canvasSize: { width: number; height: number };
	fps: { numerator: number; denominator: number };
	totalDurationSeconds: number;
	aspectRatio: string;
}

export interface ProductionScriptCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "refused";
		operation: ProductionScriptInput["operation"];
		editId: string;
		message: string;
		reason?: "edit-not-found" | "expected-revision-required" | "input-invalid" | "legacy-revision-required" | "revision-conflict" | "draft-required" | "idempotency-conflict";
		revision?: CommandEditRevision;
		draft?: ProductionScriptView;
		accepted?: ProductionScriptView;
		acceptedRevision?: CommandProductionRevisionReference;
		summary?: { shotCount: number; totalDurationSeconds: number; aspectRatio: string };
	};
}

export type ProductionRegenerationRole = "visual" | "narration";
export type ProductionAcceptVersionRole = ProductionRegenerationRole | "animation";

export interface ProductionAnimateInput {
	motionBrief?: string;
	model?: ProductionImageModelPin;
	editId: string;
	expectedRevision: CommandEditRevision;
	acceptedRevision: CommandProductionRevisionReference;
	shotIds: string[];
	newVersion?: boolean;
}

export interface ProductionAnimateCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "pending" | "refused";
		operation: "production-animate";
		editId: string;
		message: string;
		reason?: "capability-unavailable" | "edit-not-found" | "expected-revision-required" | "input-invalid" | "revision-conflict" | "accepted-source-mismatch" | "duration-out-of-range" | "producer-failed" | "producer-timeout";
		revision?: CommandEditRevision;
		jobRef?: string;
		shots?: Array<{ shotId: string; candidateId: string; publicId: string; path: string; digest: string; durationSeconds: number }>;
	};
}

export interface ProductionTargetInput {
	editId: string;
	expectedRevision: CommandEditRevision;
	acceptedRevision: CommandProductionRevisionReference;
	shotIds?: string[];
}

export interface ProductionTargetOffer {
	shotId: string;
	shotRevision: string;
	image: {
		accepted?: { mediaId: string; mediaRevision: string; inLibrary: boolean };
		inLibrary: boolean;
		candidates: Array<{ candidateId: string; publicId?: string; digest?: string; model?: ProductionImageModelPin; aspectRatio?: string; dimensions?: { width: number; height: number }; references?: Array<{ name: string }>; styleAnchorRevision?: string }>;
	};
	animation?: {
		accepted?: { mediaId: string; mediaRevision: string; inLibrary: boolean };
		inLibrary: boolean;
		candidates: Array<{ candidateId: string; mediaId: string; mediaRevision: string; durationSeconds?: number }>;
	};
	narration: {
		accepted?: { mediaId: string; mediaRevision: string; inLibrary: boolean };
		inLibrary: boolean;
		history: Array<{ mediaId: string; mediaRevision: string }>;
		candidates: Array<{ candidateId: string; mediaId: string; mediaRevision: string }>;
	};
	downstream: Array<"placement" | "render">;
}

export interface ProductionTargetsCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "refused";
		operation: "production-targets";
		editId: string;
		message: string;
		reason?: string;
		revision?: CommandEditRevision;
		acceptedRevision?: CommandProductionRevisionReference;
		shots?: ProductionTargetOffer[];
	};
}

export interface ProductionRegenerateInput extends ProductionTargetInput {
	idempotencyKey: string;
	changes: Array<{
		shotId: string;
		role: ProductionRegenerationRole;
		brief?: string;
		useVersion?: string;
		references?: ProductionImageReferenceSelection;
	}>;
	attempt?: number;
	model?: ProductionImageModelPin;
	strength?: number;
	references?: ProductionImageReferenceSelection;
	styleAnchor?: ProductionStyleAnchorInput;
}

export interface ProductionRegenerateCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "pending" | "refused";
		operation: "production-regenerate";
		editId: string;
		message: string;
		reason?: string;
		revision?: CommandEditRevision;
		results?: Array<{
			shotId: string;
			role: ProductionRegenerationRole;
			candidateId: string;
			status: "candidate" | "reused";
		}>;
		staleOutputs?: Array<"placement" | "render">;
	};
}

export interface ProductionAcceptVersionInput extends ProductionTargetInput {
	placeOnTimeline?: boolean;
	shotId: string;
	shotRevision: number;
	role: ProductionAcceptVersionRole;
	idempotencyKey: string;
	candidateId?: string;
	useVersion?: string;
}

export interface ProductionAcceptVersionCommandInput extends Omit<ProductionAcceptVersionInput, "shotRevision"> {
	shotRevision: string;
}

export interface ProductionAcceptVersionCommandResult {
	kind: "json";
	data: {
		supported: boolean;
		status: "completed" | "refused";
		operation: "production-accept-version";
		editId: string;
		message: string;
		reason?: string;
		revision?: CommandEditRevision;
		shotId?: string;
		role?: ProductionAcceptVersionRole;
		staleOutputs?: Array<"placement" | "render">;
	};
}
