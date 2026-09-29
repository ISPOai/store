import type { SerializedProject } from "@/services/storage/types";

export interface ProductionShotInput {
	shotId?: string;
	clientKey: string;
	narration: string;
	visualBrief: string;
	motionBrief?: string;
	durationMs: number;
}

export interface ProductionScriptDraftShot {
	shotId: string;
	narration: string;
	visualBrief: string;
	motionBrief: string;
	durationMs: number;
}

export interface ProductionScriptDraft {
	script: string;
	shots: ProductionScriptDraftShot[];
	baseAcceptedReference: ProductionRevisionReference | null;
}

export interface ProductionImageCandidate {
	kind: "storyboard-image";
	idempotencyKey: string;
	/** Stable host-facing identity. Older stored candidates may omit these fields. */
	candidateId?: string;
	mediaId?: string;
	version?: { mediaRevision: string };
	visualBrief?: string;
	prompt?: string;
	model?: { modelKey: string; modelVersion: string };
	strength?: number;
	references?: ProductionImageReference[];
	styleAnchorRevision?: string;
	aspectRatio?: ProductionImageAspectRatio;
	dimensions?: { width: number; height: number };
	acceptedRevision: ProductionRevisionReference;
	shotId: string;
	shotRevision: number;
	resource: {
		kind: "files";
		publicId: string;
		path: string;
		digest: string;
		byteLength: number;
		mimeType: "image/png" | "image/jpeg" | "image/webp";
		dimensions: { width: number; height: number };
	};
}

export interface ProductionAnimationSource {
	mediaId: string;
	mediaRevision: string;
	publicId: string;
	revision?: string;
	digest: string;
}

export interface ProductionAnimationCandidate {
	kind: "scene-video";
	idempotencyKey: string;
	/** Stable host-facing identity shared with visual and narration candidates. */
	candidateId?: string;
	version?: { mediaRevision: string };
	motionBrief: string;
	sourceImage: ProductionAnimationSource;
	model?: { modelKey: string; modelVersion: string };
	aspectRatio?: ProductionImageAspectRatio;
	mediaId: string;
	mediaRevision: string;
	dimensions: { width: number; height: number };
	acceptedRevision: ProductionRevisionReference;
	shotId: string;
	shotRevision: number;
	resource: {
		kind: "files";
		publicId: string;
		path: string;
		digest: string;
		byteLength: number;
		mimeType: "video/mp4";
		durationSeconds: number;
		dimensions: { width: number; height: number };
	};
}

export interface ProductionImageReference {
	publicId: string;
	name: string;
}

export type ProductionImageReferenceSelection =
	| { mode: "previous"; count?: number }
	| { mode: "random"; count: number; pool: "style-anchor" | "accepted" | "files-folder"; folder?: string }
	| { mode: "explicit"; publicIds: string[] };

export interface ProductionStyleAnchor {
	revision: string;
	styleSentence: string;
	references: ProductionImageReference[];
}

export interface ProductionStyleAnchorInput {
	styleSentence: string;
	referencePublicIds: string[];
}

export interface ProductionPendingJob {
	role: "visual" | "narration" | "animation";
	status?: "pending" | "failed";
	jobRef: string;
	idempotencyKey: string;
	pendingSince?: number | string;
	acceptedRevision: ProductionRevisionReference;
	shotId: string;
	shotRevision: number;
	model?: { modelKey: string; modelVersion: string };
	voice?: "neutral" | "warm" | "authoritative" | "conversational";
	visualBrief?: string;
	prompt?: string;
	references?: ProductionImageReference[];
	styleAnchorRevision?: string;
	strength?: number;
	failureReason?: "producer-failed" | "producer-timeout";
	failureMessage?: string;
}

export type ProductionImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";

export interface ProductionMediaVersion {
	idempotencyKey?: string;
	model?: { modelKey: string; modelVersion: string };
	strength?: number;
	references?: ProductionImageReference[];
	styleAnchorRevision?: string;
	aspectRatio?: ProductionImageAspectRatio;
	dimensions?: { width: number; height: number };
	filesRef?: { publicId: string; path?: string; revision?: string };
	publishedFiles?: { publicId: string; path?: string; revision?: string };
	mediaId: string;
	mediaRevision: string;
	name: string;
	mediaType: "image" | "video" | "audio";
	mimeType: "image/png" | "image/jpeg" | "image/webp" | "audio/wav" | "video/mp4" | "video/webm";
	digest: string;
	byteLength: number;
	sourceDurationSeconds: number;
}

export interface ProductionAnimationVersion extends ProductionMediaVersion {
	mediaType: "video";
	mimeType: "video/mp4";
	motionBrief: string;
	sourceImage: ProductionAnimationSource;
}

export interface ProductionNarrationVersion extends ProductionMediaVersion {
	mediaType: "audio";
	mimeType: "audio/wav";
	/** Present when this version is exposed as a reviewable candidate. */
	candidateId?: string;
	version?: { mediaRevision: string };
	idempotencyKey: string;
	source: "voicebox" | "files";
	acceptedRevision: ProductionRevisionReference;
	acceptedShotId: string;
	acceptedShotRevision: number;
	voiceboxGenerationRef?: string;
	publishedFiles?: { publicId: string; path?: string; revision?: string };
	alignment: Array<{ text: string; start: number; end: number }>;
}

export interface AcceptedProductionShot {
	shotId: string;
	revision: number;
	narration: string;
	visualBrief: string;
	motionBrief: string;
	durationMs: number;
	imageCandidates?: ProductionImageCandidate[];
	imageVersion?: ProductionMediaVersion;
	animationCandidates?: ProductionAnimationCandidate[];
	animationVersion?: ProductionAnimationVersion;
	animationVersionHistory?: ProductionAnimationVersion[];
	narrationVersion?: ProductionNarrationVersion;
	imageVersionHistory?: ProductionMediaVersion[];
	narrationVersionHistory?: ProductionNarrationVersion[];
	narrationCandidates?: ProductionNarrationVersion[];
}

export interface ProductionRevisionReference {
	editId: string;
	documentIntentRevision: string;
	productionRevisionId: string;
	contentDigest: string;
}

export interface AcceptedProductionRevision {
	reference: ProductionRevisionReference;
	script: string;
	shots: AcceptedProductionShot[];
	pendingJobs?: ProductionPendingJob[];
	targetDurationMs: number;
	canvas: { width: number; height: number };
	fps: { numerator: number; denominator: number };
}

export interface ProductionAcceptanceReceipt {
	idempotencyKey: string;
	requestDigest: string;
	reference: ProductionRevisionReference;
}

export interface ProductionActionIntent {
	intentId: string;
	idempotencyKey: string;
	requestDigest: string;
	documentIntentRevision: string;
	acceptedRevision: ProductionRevisionReference;
	unresolvedQuestionRefs: string[];
}

export type ProductionDependencyNodeKind =
	| "script"
	| "shot"
	| "image"
	| "animation"
	| "narration"
	| "placement"
	| "render";

export interface ProductionDependencyNode {
	kind: ProductionDependencyNodeKind;
	id: string;
	versionId?: string;
}

export interface ProductionDependencyEdge {
	from: ProductionDependencyNode;
	to: ProductionDependencyNode;
}

export interface ProductionPlacementDependency {
	placementId: string;
	idempotencyKey: string;
	documentIntentRevision: string;
	elements: Array<{
		shotId: string;
		role: "visual" | "narration" | "caption";
		trackId: string;
		elementId: string;
	}>;
}

export interface ProductionRenderDependency {
	renderId: string;
	artifactId?: string;
	operationId?: string;
}

export interface ProductionDependencyGraph {
	acceptedRevision: ProductionRevisionReference;
	edges: ProductionDependencyEdge[];
	placements: ProductionPlacementDependency[];
	renders: ProductionRenderDependency[];
}

export interface ProductionRegenerationCandidate {
	candidateId: string;
	acceptedRevision: ProductionRevisionReference;
	shotId: string;
	shotRevision: number;
	role: "visual" | "narration";
	brief?: string;
	version: ProductionMediaVersion | ProductionNarrationVersion;
}

export interface ProductionRegenerationReceipt {
	idempotencyKey: string;
	requestDigest: string;
	acceptedRevision: ProductionRevisionReference;
	candidateIds: string[];
}

export interface ProductionState {
	formatVersion: 1;
	accepted: AcceptedProductionRevision | null;
	acceptanceReceipts: ProductionAcceptanceReceipt[];
	actionIntents: ProductionActionIntent[];
	draft?: ProductionScriptDraft;
	acceptedHistory?: AcceptedProductionRevision[];
	dependencyGraph?: ProductionDependencyGraph;
	regenerationCandidates?: ProductionRegenerationCandidate[];
	regenerationReceipts?: ProductionRegenerationReceipt[];
	styleAnchor?: ProductionStyleAnchor;
}

export interface ProductionSnapshot {
	editId: string;
	documentRevision: EditRevision | null;
	legacyStorageCasRevision: string | null;
	accepted: AcceptedProductionRevision | null;
	draft: ProductionScriptDraft | null;
	canvas: { width: number; height: number };
	fps: { numerator: number; denominator: number };
	actionIntents: ProductionActionIntent[];
	acceptedHistory?: AcceptedProductionRevision[];
	dependencyGraph?: ProductionDependencyGraph;
	regenerationCandidates?: ProductionRegenerationCandidate[];
	regenerationReceipts?: ProductionRegenerationReceipt[];
	styleAnchor?: ProductionStyleAnchor;
}

export interface ProductionAcceptanceResult {
	documentRevision: EditRevision;
	accepted: AcceptedProductionRevision;
}

export interface ProductionIntentResult {
	documentRevision: EditRevision;
	intent: ProductionActionIntent;
}

export class ProductionInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProductionInputError";
	}
}

export class ProductionIdempotencyError extends Error {
	readonly idempotencyKey: string;

	constructor(idempotencyKey: string) {
		super(`Production operation ${idempotencyKey} was reused with different input`);
		this.name = "ProductionIdempotencyError";
		this.idempotencyKey = idempotencyKey;
	}
}

export class ProductionRevisionSupersededError extends Error {
	readonly reference: ProductionRevisionReference;

	constructor(reference: ProductionRevisionReference) {
		super(`Production revision ${reference.productionRevisionId} is no longer current`);
		this.name = "ProductionRevisionSupersededError";
		this.reference = reference;
	}
}

export class ProductionDraftStaleError extends Error {
	readonly expected: ProductionRevisionReference | null;
	readonly actual: ProductionRevisionReference | null;

	constructor({
		expected,
		actual,
	}: {
		expected: ProductionRevisionReference | null;
		actual: ProductionRevisionReference | null;
	}) {
		super("The accepted production revision changed before this draft was accepted");
		this.name = "ProductionDraftStaleError";
		this.expected = expected;
		this.actual = actual;
	}
}

export class ProductionDraftRequiredError extends Error {
	constructor() {
		super("Save a production script draft before accepting it");
		this.name = "ProductionDraftRequiredError";
	}
}

export interface EditRevision {
	editId: string;
	storageCasRevision: string;
	intentRevision: string;
	digest: string;
}

export function isEditRevisionNewer(
	candidate: EditRevision,
	current: EditRevision | null,
): boolean {
	return (
		current === null ||
		(candidate.editId === current.editId &&
			Number(candidate.storageCasRevision) >
				Number(current.storageCasRevision))
	);
}

export interface StoredEditSnapshot {
	intentRevision: string;
	digest: string;
	project: SerializedProject;
}

/** Derived project values are stored separately from revision snapshots. */
export interface StoredProjectDerivedData {
	thumbnail?: string;
	timelineViewState?: NonNullable<SerializedProject["timelineViewState"]>;
}

export interface StoredProductionDocument extends SerializedProject {
	kind: "opencut.production-document";
	formatVersion: 1;
	editId: string;
	currentIntentRevision: string;
	snapshots: StoredEditSnapshot[];
	derived?: StoredProjectDerivedData;
}

export interface LoadedProductionDocument {
	revision: EditRevision;
	project: SerializedProject;
}

export type ProductionDocumentCurrentRead =
	| { kind: "document"; document: LoadedProductionDocument }
	| {
			kind: "legacy";
			editId: string;
			storageCasRevision: string;
			project: SerializedProject;
	  };

export interface PublishedEditRevision {
	revision: EditRevision;
	publicId: string;
	path: string;
}

export type DocumentSaveStatus =
	| { kind: "clean"; revision: EditRevision | null }
	| { kind: "dirty"; revision: EditRevision | null }
	| { kind: "saving"; revision: EditRevision | null }
	| {
			kind: "conflict";
			expected: EditRevision | null;
			actual: EditRevision;
	  }
	| { kind: "failed"; revision: EditRevision | null; message: string };

export class EditRevisionConflictError extends Error {
	readonly editId: string;
	readonly expected: EditRevision | null;
	readonly actual: EditRevision;

	constructor({
		editId,
		expected,
		actual,
	}: {
		editId: string;
		expected: EditRevision | null;
		actual: EditRevision;
	}) {
		super(`Edit ${editId} changed since revision ${expected?.intentRevision ?? "new"}`);
		this.name = "EditRevisionConflictError";
		this.editId = editId;
		this.expected = expected;
		this.actual = actual;
	}
}

export class LegacyEditRevisionConflictError extends Error {
	readonly editId: string;
	readonly expectedStorageCasRevision: string;
	readonly actualStorageCasRevision: string;

	constructor({
		editId,
		expectedStorageCasRevision,
		actualStorageCasRevision,
	}: {
		editId: string;
		expectedStorageCasRevision: string;
		actualStorageCasRevision: string;
	}) {
		super(
			`Edit ${editId} changed since legacy storage revision ${expectedStorageCasRevision}`,
		);
		this.name = "LegacyEditRevisionConflictError";
		this.editId = editId;
		this.expectedStorageCasRevision = expectedStorageCasRevision;
		this.actualStorageCasRevision = actualStorageCasRevision;
	}
}
