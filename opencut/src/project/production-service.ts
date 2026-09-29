import { ProductionDocumentService } from "./production-document-service";
import type {
	AcceptedProductionRevision,
	AcceptedProductionShot,
	EditRevision,
	LoadedProductionDocument,
	ProductionImageCandidate,
	ProductionMediaVersion,
	ProductionNarrationVersion,
	ProductionAcceptanceResult,
	ProductionActionIntent,
	ProductionAnimationCandidate,
	ProductionAnimationVersion,
	ProductionDependencyGraph,
	ProductionDependencyEdge,
	ProductionIntentResult,
	ProductionRegenerationCandidate,
	ProductionRegenerationReceipt,
	ProductionRevisionReference,
	ProductionScriptDraft,
	ProductionScriptDraftShot,
	ProductionShotInput,
	ProductionSnapshot,
	ProductionState,
	ProductionPendingJob,
	ProductionStyleAnchor,
} from "./production-types";
import {
	EditRevisionConflictError,
	ProductionDraftRequiredError,
	ProductionDraftStaleError,
	ProductionIdempotencyError,
	ProductionInputError,
	ProductionRevisionSupersededError,
} from "./production-types";
import type { SerializedProject } from "@/services/storage/types";
import type { ProductionShotPlacementInput } from "@/timeline/production-placement";
import {
	canonicalEditRevision,
	canonicalProductionRevisionReference,
} from "@/services/project-command-types";

const MAX_SCRIPT_LENGTH = 20_000;
const MAX_SHOT_TEXT_LENGTH = 4_000;
const MAX_SHOTS = 100;
const MAX_SHOT_DURATION_MS = Math.floor(Number.MAX_SAFE_INTEGER / MAX_SHOTS);
const MAX_QUESTION_REFS = 100;
const MAX_REFERENCE_LENGTH = 256;
const MAX_VERSION_HISTORY = 64;
const MAX_REGENERATION_CANDIDATES = 512;

type ProductionDocuments = Pick<
	ProductionDocumentService,
	"admitLegacy" | "readCurrent" | "readRevision" | "save"
>;

interface AcceptProductionInput {
	editId: string;
	expectedRevision: EditRevision | null;
	expectedLegacyStorageCasRevision?: string;
	baseAcceptedReference?: ProductionRevisionReference | null;
	idempotencyKey: string;
	script: string;
	shots: ProductionShotInput[];
	allowNewShotIds?: boolean;
}

export interface SaveProductionScriptDraftInput {
	editId: string;
	expectedRevision: EditRevision;
	script: string;
	shots: Array<{
		shotId?: string;
		narration: string;
		visualBrief: string;
		motionBrief?: string;
		durationMs: number;
	}>;
}

export interface ProductionScriptDraftResult {
	documentRevision: EditRevision;
	draft: ProductionScriptDraft;
}

export interface AcceptProductionScriptDraftInput {
	editId: string;
	expectedRevision: EditRevision;
	idempotencyKey: string;
}

interface SubmitProductionInput {
	reference: ProductionRevisionReference;
	expectedRevision: EditRevision;
	idempotencyKey: string;
	unresolvedQuestionRefs: string[];
}

interface RunAcceptedInput<T> {
	reference: ProductionRevisionReference;
	run: (revision: AcceptedProductionRevision) => Promise<T> | T;
}

export interface ProductionMediaAttachmentInput {
	reference: ProductionRevisionReference;
	expectedRevision: EditRevision;
	shotId: string;
	shotRevision: number;
	role: "visual" | "animation" | "narration";
	version: ProductionMediaVersion | ProductionAnimationVersion | ProductionNarrationVersion;
	idempotencyKey: string;
}

function emptyProductionState(): ProductionState {
	return {
		formatVersion: 1,
		accepted: null,
		acceptanceReceipts: [],
		actionIntents: [],
	};
}

function productionState(project: SerializedProject): ProductionState {
	const state = project.settings.production;
	if (!state) return emptyProductionState();
	if (
		state.formatVersion !== 1 ||
		!Array.isArray(state.acceptanceReceipts) ||
		!Array.isArray(state.actionIntents) ||
		(state.acceptedHistory !== undefined && !Array.isArray(state.acceptedHistory)) ||
		(state.draft !== undefined && !Array.isArray(state.draft.shots)) ||
		(state.accepted !== null && state.accepted !== undefined && state.accepted.shots.some((shot) => shot.animationCandidates !== undefined && !Array.isArray(shot.animationCandidates))) ||
		(state.accepted !== null && state.accepted !== undefined && state.accepted.pendingJobs !== undefined && !Array.isArray(state.accepted.pendingJobs)) ||
		(state.regenerationCandidates !== undefined && !Array.isArray(state.regenerationCandidates)) ||
		(state.regenerationReceipts !== undefined && !Array.isArray(state.regenerationReceipts)) ||
		(state.styleAnchor !== undefined && (!Array.isArray(state.styleAnchor.references) || typeof state.styleAnchor.styleSentence !== "string" || typeof state.styleAnchor.revision !== "string"))
	) {
		throw new ProductionInputError("The saved production plan is not supported");
	}
	const normalized = structuredClone(state);
	const normalizeAccepted = (accepted: AcceptedProductionRevision): AcceptedProductionRevision => {
		const result = structuredClone(accepted);
		result.reference = canonicalProductionRevisionReference(result.reference);
		for (const shot of result.shots) {
			if (typeof shot.motionBrief !== "string") shot.motionBrief = shot.visualBrief;
			for (const candidate of shot.imageCandidates ?? []) candidate.acceptedRevision = canonicalProductionRevisionReference(candidate.acceptedRevision);
			for (const version of [shot.narrationVersion, ...(shot.narrationVersionHistory ?? []), ...(shot.narrationCandidates ?? [])]) {
				if (version) version.acceptedRevision = canonicalProductionRevisionReference(version.acceptedRevision);
			}
			for (const candidate of shot.animationCandidates ?? []) candidate.acceptedRevision = canonicalProductionRevisionReference(candidate.acceptedRevision);
		}
		for (const pendingJob of result.pendingJobs ?? []) pendingJob.acceptedRevision = canonicalProductionRevisionReference(pendingJob.acceptedRevision);
		return result;
	};
	if (normalized.accepted) normalized.accepted = normalizeAccepted(normalized.accepted);
	if (normalized.acceptedHistory) normalized.acceptedHistory = normalized.acceptedHistory.map(normalizeAccepted);
	if (normalized.draft) {
		for (const shot of normalized.draft.shots) {
			if (typeof shot.motionBrief !== "string") shot.motionBrief = shot.visualBrief;
		}
	}
	if (normalized.draft?.baseAcceptedReference) normalized.draft.baseAcceptedReference = canonicalProductionRevisionReference(normalized.draft.baseAcceptedReference);
	for (const receipt of normalized.acceptanceReceipts) receipt.reference = canonicalProductionRevisionReference(receipt.reference);
	for (const intent of normalized.actionIntents) {
		intent.documentIntentRevision = String(intent.documentIntentRevision);
		intent.acceptedRevision = canonicalProductionRevisionReference(intent.acceptedRevision);
	}
	if (normalized.dependencyGraph) {
		normalized.dependencyGraph.acceptedRevision = canonicalProductionRevisionReference(normalized.dependencyGraph.acceptedRevision);
		for (const placement of normalized.dependencyGraph.placements) placement.documentIntentRevision = String(placement.documentIntentRevision);
	}
	for (const candidate of normalized.regenerationCandidates ?? []) {
		candidate.acceptedRevision = canonicalProductionRevisionReference(candidate.acceptedRevision);
	}
	for (const receipt of normalized.regenerationReceipts ?? []) receipt.acceptedRevision = canonicalProductionRevisionReference(receipt.acceptedRevision);
	if (normalized.styleAnchor) {
		normalized.styleAnchor = structuredClone(normalized.styleAnchor);
		normalized.styleAnchor.references = normalized.styleAnchor.references.map((reference) => ({
		publicId: String(reference.publicId),
		name: String(reference.name),
	}));
	}
	return normalized;
}

function validateDraftInput(input: SaveProductionScriptDraftInput): void {
	assertReference(input.editId, "Edit ID");
	assertBoundedText({ value: input.script, label: "Script", maxLength: MAX_SCRIPT_LENGTH });
	if (input.shots.length === 0 || input.shots.length > MAX_SHOTS) {
		throw new ProductionInputError(`Choose between 1 and ${MAX_SHOTS} shots`);
	}
	for (const [index, shot] of input.shots.entries()) {
		if (shot.shotId !== undefined) assertReference(shot.shotId, `Shot ${index + 1} ID`);
		assertBoundedText({ value: shot.narration, label: `Shot ${index + 1} narration`, maxLength: MAX_SHOT_TEXT_LENGTH, allowEmpty: true });
		assertBoundedText({ value: shot.visualBrief, label: `Shot ${index + 1} visual brief`, maxLength: MAX_SHOT_TEXT_LENGTH });
		if (shot.motionBrief !== undefined) assertBoundedText({ value: shot.motionBrief, label: `Shot ${index + 1} motion brief`, maxLength: 2_500 });
		if (!Number.isSafeInteger(shot.durationMs) || shot.durationMs <= 0 || shot.durationMs > MAX_SHOT_DURATION_MS) {
			throw new ProductionInputError(`Shot ${index + 1} duration is invalid`);
		}
	}
}

function assertBoundedText({
	value,
	label,
	maxLength,
	allowEmpty = false,
}: {
	value: string;
	label: string;
	maxLength: number;
	allowEmpty?: boolean;
}): void {
	if (!allowEmpty && value.trim().length === 0) {
		throw new ProductionInputError(`${label} is required`);
	}
	if (value.length > maxLength) {
		throw new ProductionInputError(`${label} is too long`);
	}
}

function assertReference(value: string, label: string): void {
	assertBoundedText({ value, label, maxLength: MAX_REFERENCE_LENGTH });
}

function validateRevisionReference(reference: ProductionRevisionReference): void {
	assertReference(reference.editId, "Edit ID");
	assertReference(reference.documentIntentRevision, "Document revision");
	assertReference(reference.productionRevisionId, "Production revision");
	assertReference(reference.contentDigest, "Production digest");
}

function sameEditRevision(left: EditRevision, right: EditRevision): boolean {
	const canonicalLeft = canonicalEditRevision(left);
	const canonicalRight = canonicalEditRevision(right);
	return (
		canonicalLeft.editId === canonicalRight.editId &&
		canonicalLeft.intentRevision === canonicalRight.intentRevision &&
		canonicalLeft.digest === canonicalRight.digest
	);
}

function sameReference(
	left: ProductionRevisionReference,
	right: ProductionRevisionReference,
): boolean {
	const canonicalLeft = canonicalProductionRevisionReference(left);
	const canonicalRight = canonicalProductionRevisionReference(right);
	return (
		canonicalLeft.editId === canonicalRight.editId &&
		canonicalLeft.documentIntentRevision === canonicalRight.documentIntentRevision &&
		canonicalLeft.productionRevisionId === canonicalRight.productionRevisionId &&
		canonicalLeft.contentDigest === canonicalRight.contentDigest
	);
}

function animationSourceMatches(
	image: ProductionMediaVersion | undefined,
	source: ProductionAnimationCandidate["sourceImage"],
): boolean {
	return image?.mediaId === source.mediaId &&
		image.mediaRevision === source.mediaRevision &&
		image.digest === source.digest &&
		image.filesRef?.publicId === source.publicId &&
		image.filesRef?.revision === source.revision;
}

function sameImageCandidate(left: ProductionImageCandidate, right: ProductionImageCandidate): boolean {
	return left.idempotencyKey === right.idempotencyKey &&
		(left.candidateId ?? left.idempotencyKey) === (right.candidateId ?? right.idempotencyKey) &&
		(left.mediaId ?? left.resource.publicId) === (right.mediaId ?? right.resource.publicId) &&
		(left.version?.mediaRevision ?? left.resource.digest) === (right.version?.mediaRevision ?? right.resource.digest) &&
		left.visualBrief === right.visualBrief &&
		left.prompt === right.prompt &&
		left.model?.modelKey === right.model?.modelKey &&
		left.model?.modelVersion === right.model?.modelVersion &&
		left.strength === right.strength &&
		left.styleAnchorRevision === right.styleAnchorRevision &&
		(left.references ?? []).length === (right.references ?? []).length &&
		(left.references ?? []).every((reference, index) => reference.publicId === right.references?.[index]?.publicId && reference.name === right.references?.[index]?.name) &&
		left.shotId === right.shotId &&
		left.shotRevision === right.shotRevision &&
		sameReference(left.acceptedRevision, right.acceptedRevision) &&
		left.resource.kind === right.resource.kind &&
		left.resource.publicId === right.resource.publicId &&
		left.resource.path === right.resource.path &&
		left.resource.digest === right.resource.digest &&
		left.resource.byteLength === right.resource.byteLength &&
		left.resource.mimeType === right.resource.mimeType &&
		left.resource.dimensions.width === right.resource.dimensions.width &&
		left.resource.dimensions.height === right.resource.dimensions.height;
}

function samePendingJob(left: ProductionPendingJob, right: ProductionPendingJob): boolean {
	return left.role === right.role &&
		(left.status ?? "pending") === (right.status ?? "pending") &&
		left.jobRef === right.jobRef &&
		left.idempotencyKey === right.idempotencyKey &&
		left.shotId === right.shotId &&
		left.shotRevision === right.shotRevision &&
		left.model?.modelKey === right.model?.modelKey &&
		left.model?.modelVersion === right.model?.modelVersion &&
		left.voice === right.voice &&
		left.visualBrief === right.visualBrief &&
		left.prompt === right.prompt &&
		left.styleAnchorRevision === right.styleAnchorRevision &&
		left.strength === right.strength &&
		(left.references ?? []).length === (right.references ?? []).length &&
		(left.references ?? []).every((reference, index) => reference.publicId === right.references?.[index]?.publicId && reference.name === right.references?.[index]?.name) &&
		left.failureReason === right.failureReason &&
		left.failureMessage === right.failureMessage &&
		sameReference(left.acceptedRevision, right.acceptedRevision);
}

function sameAnimationCandidate(left: ProductionAnimationCandidate, right: ProductionAnimationCandidate): boolean {
	return left.kind === right.kind &&
		left.idempotencyKey === right.idempotencyKey &&
		(left.candidateId ?? left.idempotencyKey) === (right.candidateId ?? right.idempotencyKey) &&
		(left.version?.mediaRevision ?? left.resource.digest) === (right.version?.mediaRevision ?? right.resource.digest) &&
		left.motionBrief === right.motionBrief &&
		left.model?.modelKey === right.model?.modelKey &&
		left.model?.modelVersion === right.model?.modelVersion &&
		left.aspectRatio === right.aspectRatio &&
		left.shotId === right.shotId &&
		left.shotRevision === right.shotRevision &&
		sameReference(left.acceptedRevision, right.acceptedRevision) &&
		left.sourceImage.mediaId === right.sourceImage.mediaId &&
		left.sourceImage.mediaRevision === right.sourceImage.mediaRevision &&
		left.sourceImage.publicId === right.sourceImage.publicId &&
		left.sourceImage.revision === right.sourceImage.revision &&
		left.sourceImage.digest === right.sourceImage.digest &&
		left.resource.publicId === right.resource.publicId &&
		left.resource.path === right.resource.path &&
		left.resource.digest === right.resource.digest &&
		left.resource.byteLength === right.resource.byteLength &&
		left.resource.durationSeconds === right.resource.durationSeconds &&
		left.resource.mimeType === right.resource.mimeType &&
		left.resource.dimensions.width === right.resource.dimensions.width &&
		left.resource.dimensions.height === right.resource.dimensions.height;
}

function isNarrationVersion(
	version: ProductionMediaVersion | ProductionAnimationVersion | ProductionNarrationVersion,
): version is ProductionNarrationVersion {
	return "alignment" in version;
}

function sameMediaVersion(
	left: ProductionMediaVersion | ProductionAnimationVersion | ProductionNarrationVersion,
	right: ProductionMediaVersion | ProductionAnimationVersion | ProductionNarrationVersion,
): boolean {
	if (left.idempotencyKey !== right.idempotencyKey || left.model?.modelKey !== right.model?.modelKey || left.model?.modelVersion !== right.model?.modelVersion || left.strength !== right.strength || left.styleAnchorRevision !== right.styleAnchorRevision || left.aspectRatio !== right.aspectRatio || left.dimensions?.width !== right.dimensions?.width || left.dimensions?.height !== right.dimensions?.height || left.mediaId !== right.mediaId || left.mediaRevision !== right.mediaRevision || left.name !== right.name || left.mediaType !== right.mediaType || left.mimeType !== right.mimeType || left.digest !== right.digest || left.byteLength !== right.byteLength || left.sourceDurationSeconds !== right.sourceDurationSeconds) return false;
	if ((left.references ?? []).length !== (right.references ?? []).length || !(left.references ?? []).every((reference, index) => reference.publicId === right.references?.[index]?.publicId && reference.name === right.references?.[index]?.name)) return false;
	const leftNarration = isNarrationVersion(left);
	if (!leftNarration) return !isNarrationVersion(right);
	if (!isNarrationVersion(right)) return false;
	const rightNarration = right;
	return left.source === rightNarration.source &&
		left.voiceboxGenerationRef === rightNarration.voiceboxGenerationRef &&
		(left.publishedFiles?.publicId ?? undefined) === (rightNarration.publishedFiles?.publicId ?? undefined) &&
		(left.publishedFiles?.path ?? undefined) === (rightNarration.publishedFiles?.path ?? undefined) &&
		(left.publishedFiles?.revision ?? undefined) === (rightNarration.publishedFiles?.revision ?? undefined) &&
		sameReference(left.acceptedRevision, rightNarration.acceptedRevision) &&
		left.acceptedShotId === rightNarration.acceptedShotId &&
		left.acceptedShotRevision === rightNarration.acceptedShotRevision &&
		left.alignment.length === rightNarration.alignment.length &&
		left.alignment.every((segment, index) => {
			const other = rightNarration.alignment[index];
			return other !== undefined && segment.text === other.text && segment.start === other.start && segment.end === other.end;
		});
}

function sameRegenerationCandidate(
	left: ProductionRegenerationCandidate,
	right: ProductionRegenerationCandidate,
): boolean {
	return left.candidateId === right.candidateId &&
		left.shotId === right.shotId &&
		left.shotRevision === right.shotRevision &&
		left.role === right.role &&
		left.brief === right.brief &&
		sameReference(left.acceptedRevision, right.acceptedRevision) &&
		sameMediaVersion(left.version, right.version);
}

function cloneMediaVersion<T extends ProductionMediaVersion | ProductionAnimationVersion | ProductionNarrationVersion>(version: T): T {
	const cloned = structuredClone(version);
	if (cloned.idempotencyKey === undefined) delete cloned.idempotencyKey;
	if (isNarrationVersion(cloned) && cloned.publishedFiles) {
		if (cloned.publishedFiles.path === undefined) delete cloned.publishedFiles.path;
		if (cloned.publishedFiles.revision === undefined) delete cloned.publishedFiles.revision;
	}
	return cloned;
}

function animationVersion(candidate: ProductionAnimationCandidate): ProductionAnimationVersion {
	return {
		idempotencyKey: candidate.idempotencyKey,
		mediaId: candidate.mediaId,
		mediaRevision: candidate.version?.mediaRevision ?? candidate.mediaRevision,
		name: candidate.resource.path.split("/").pop() || `${candidate.shotId}.mp4`,
		mediaType: "video",
		mimeType: "video/mp4",
		digest: candidate.resource.digest,
		byteLength: candidate.resource.byteLength,
		sourceDurationSeconds: candidate.resource.durationSeconds,
		filesRef: { publicId: candidate.resource.publicId, path: candidate.resource.path },
		motionBrief: candidate.motionBrief,
		sourceImage: structuredClone(candidate.sourceImage),
		...(candidate.model ? { model: structuredClone(candidate.model) } : {}),
		...(candidate.aspectRatio ? { aspectRatio: candidate.aspectRatio } : {}),
		dimensions: structuredClone(candidate.dimensions),
	};
}

function cloneDependencyGraph(graph: ProductionDependencyGraph): ProductionDependencyGraph {
	const cloned = structuredClone(graph);
	for (const edge of cloned.edges) {
		if (edge.from.versionId === undefined) delete edge.from.versionId;
		if (edge.to.versionId === undefined) delete edge.to.versionId;
	}
	for (const render of cloned.renders) {
		if (render.artifactId === undefined) delete render.artifactId;
		if (render.operationId === undefined) delete render.operationId;
	}
	return cloned;
}

function sameNullableReference(
	left: ProductionRevisionReference | null,
	right: ProductionRevisionReference | null,
): boolean {
	return left === null || right === null
		? left === right
		: sameReference(left, right);
}

function sameShotContent(
	left: AcceptedProductionShot,
	right: ProductionShotInput,
): boolean {
	return (
		left.narration === right.narration &&
		left.visualBrief === right.visualBrief &&
		left.motionBrief === (right.motionBrief ?? right.visualBrief) &&
		left.durationMs === right.durationMs
	);
}

async function digest<T>(value: T): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(value));
	const result = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(result), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function nextIntentRevision(current: EditRevision): string {
	const revision = Number.parseInt(current.intentRevision, 10);
	if (!Number.isSafeInteger(revision) || revision < 1) {
		throw new ProductionInputError("The edit revision is not supported");
	}
	return String(revision + 1);
}

function withProductionState(
	project: SerializedProject,
	state: ProductionState,
): SerializedProject {
	return {
		...structuredClone(project),
		settings: {
			...structuredClone(project.settings),
			production: state,
		},
	};
}

function dependencyGraphFor(
	accepted: AcceptedProductionRevision,
	prior: ProductionDependencyGraph | undefined,
): ProductionDependencyGraph {
	const script: ProductionDependencyGraph["edges"][number]["from"] = {
		kind: "script",
		id: accepted.reference.productionRevisionId,
		versionId: accepted.reference.contentDigest,
	};
	const edges: ProductionDependencyEdge[] = [];
	for (const shot of accepted.shots) {
		const shotNode = { kind: "shot" as const, id: shot.shotId, versionId: String(shot.revision) };
		edges.push({ from: script, to: shotNode });
		if (shot.imageVersion) {
			edges.push({
				from: shotNode,
				to: { kind: "image", id: shot.shotId, versionId: shot.imageVersion.mediaRevision },
			});
		}
		if (shot.animationVersion) {
			edges.push({
				from: shotNode,
				to: { kind: "animation", id: shot.shotId, versionId: shot.animationVersion.mediaRevision },
			});
		}
		if (shot.narrationVersion) {
			edges.push({
				from: shotNode,
				to: { kind: "narration", id: shot.shotId, versionId: shot.narrationVersion.mediaRevision },
			});
		}
	}
	for (const placement of prior?.placements ?? []) {
		const placementNode = { kind: "placement" as const, id: placement.placementId };
		for (const element of placement.elements) {
			const media = accepted.shots.find((shot) => shot.shotId === element.shotId);
			const version = element.role === "visual" ? (media?.animationVersion ?? media?.imageVersion) : media?.narrationVersion;
			if (version) edges.push({ from: { kind: element.role === "visual" && media?.animationVersion ? "animation" : element.role === "visual" ? "image" : "narration", id: element.shotId, versionId: version.mediaRevision }, to: placementNode });
		}
		for (const render of prior?.renders ?? []) {
			const renderNode: ProductionDependencyEdge["to"] = {
				kind: "render",
				id: render.renderId,
			};
			if (render.artifactId !== undefined) renderNode.versionId = render.artifactId;
			edges.push({ from: placementNode, to: renderNode });
		}
	}
	return {
		acceptedRevision: canonicalProductionRevisionReference(accepted.reference),
		edges,
		placements: structuredClone(prior?.placements ?? []),
		renders: structuredClone(prior?.renders ?? []),
	};
}

function validateAcceptInput(input: AcceptProductionInput): void {
	assertReference(input.editId, "Edit ID");
	assertReference(input.idempotencyKey, "Idempotency key");
	if (input.expectedLegacyStorageCasRevision !== undefined) {
		assertReference(input.expectedLegacyStorageCasRevision, "Legacy storage revision");
	}
	if (
		(input.expectedRevision === null) !==
		(input.expectedLegacyStorageCasRevision !== undefined)
	) {
		throw new ProductionInputError("Choose exactly one document revision expectation");
	}
	if (input.baseAcceptedReference) {
		validateRevisionReference(input.baseAcceptedReference);
	}
	assertBoundedText({
		value: input.script,
		label: "Script",
		maxLength: MAX_SCRIPT_LENGTH,
	});
	if (input.shots.length === 0 || input.shots.length > MAX_SHOTS) {
		throw new ProductionInputError(`Choose between 1 and ${MAX_SHOTS} shots`);
	}
	for (const [index, shot] of input.shots.entries()) {
		assertReference(shot.clientKey, `Shot ${index + 1} key`);
		if (shot.shotId) assertReference(shot.shotId, `Shot ${index + 1} ID`);
		assertBoundedText({
			value: shot.narration,
			label: `Shot ${index + 1} narration`,
			maxLength: MAX_SHOT_TEXT_LENGTH,
			allowEmpty: true,
		});
		assertBoundedText({
			value: shot.visualBrief,
			label: `Shot ${index + 1} visual brief`,
			maxLength: MAX_SHOT_TEXT_LENGTH,
		});
		if (shot.motionBrief !== undefined) {
			assertBoundedText({ value: shot.motionBrief, label: `Shot ${index + 1} motion brief`, maxLength: 2_500 });
		}
		if (
			!Number.isSafeInteger(shot.durationMs) ||
			shot.durationMs <= 0 ||
			shot.durationMs > MAX_SHOT_DURATION_MS
		) {
			throw new ProductionInputError(`Shot ${index + 1} duration is invalid`);
		}
	}
}

async function buildShots({
	input,
	previous,
}: {
	input: AcceptProductionInput;
	previous: AcceptedProductionRevision | null;
}): Promise<AcceptedProductionShot[]> {
	const previousById = new Map(
		(previous?.shots ?? []).map((shot) => [shot.shotId, shot]),
	);
	const seen = new Set<string>();
	const shots: AcceptedProductionShot[] = [];
	for (const shot of input.shots) {
		const shotId = shot.shotId ??
			`shot-${(await digest([input.idempotencyKey, shot.clientKey])).slice(0, 24)}`;
		if (shot.shotId && !previousById.has(shot.shotId) && !input.allowNewShotIds) {
			throw new ProductionInputError(`Shot ${shot.shotId} is not in the current revision`);
		}
		if (seen.has(shotId)) {
			throw new ProductionInputError(`Shot ${shotId} appears more than once`);
		}
		seen.add(shotId);
		const prior = previousById.get(shotId);
		const unchanged = prior ? sameShotContent(prior, shot) : false;
		const imageHistory = prior?.imageVersionHistory ? structuredClone(prior.imageVersionHistory) : [];
		const animationHistory = prior?.animationVersionHistory ? structuredClone(prior.animationVersionHistory) : [];
		const narrationHistory = prior?.narrationVersionHistory ? structuredClone(prior.narrationVersionHistory) : [];
		if (prior?.imageVersion && !unchanged) imageHistory.push(structuredClone(prior.imageVersion));
		if (prior?.animationVersion && !unchanged) animationHistory.push(structuredClone(prior.animationVersion));
		if (prior?.narrationVersion && !unchanged) narrationHistory.push(structuredClone(prior.narrationVersion));
		const nextShot: AcceptedProductionShot = {
			shotId,
			revision: prior ? prior.revision + Number(!sameShotContent(prior, shot)) : 1,
			narration: shot.narration,
			visualBrief: shot.visualBrief,
			motionBrief: shot.motionBrief ?? shot.visualBrief,
			durationMs: shot.durationMs,
		};
		if (unchanged && prior?.imageVersion) nextShot.imageVersion = structuredClone(prior.imageVersion);
		if (unchanged && prior?.animationVersion) nextShot.animationVersion = structuredClone(prior.animationVersion);
		if (unchanged && prior?.narrationVersion) nextShot.narrationVersion = structuredClone(prior.narrationVersion);
		if (imageHistory.length > 0) nextShot.imageVersionHistory = imageHistory.slice(-MAX_VERSION_HISTORY);
		if (animationHistory.length > 0) nextShot.animationVersionHistory = animationHistory.slice(-MAX_VERSION_HISTORY);
		if (narrationHistory.length > 0) nextShot.narrationVersionHistory = narrationHistory.slice(-MAX_VERSION_HISTORY);
		shots.push(nextShot);
	}
	return shots;
}

export class ProductionService {
	constructor(
		private readonly documents: ProductionDocuments =
			new ProductionDocumentService(),
	) {}

	async load(editId: string): Promise<ProductionSnapshot | null> {
		const current = await this.documents.readCurrent(editId);
		if (!current) return null;
		const document = current.kind === "document" ? current.document : null;
		const state = productionState(
			current.kind === "document" ? current.document.project : current.project,
		);
		return {
			editId,
			documentRevision: document?.revision ?? null,
			legacyStorageCasRevision:
				current.kind === "legacy" ? current.storageCasRevision : null,
			accepted: state.accepted,
			draft: state.draft ?? null,
			canvas: structuredClone(current.kind === "document" ? current.document.project.settings.canvasSize : current.project.settings.canvasSize),
			fps: structuredClone(current.kind === "document" ? current.document.project.settings.fps : current.project.settings.fps),
			actionIntents: state.actionIntents,
			acceptedHistory: state.acceptedHistory,
			dependencyGraph: state.dependencyGraph,
			regenerationCandidates: state.regenerationCandidates,
			regenerationReceipts: state.regenerationReceipts,
			styleAnchor: state.styleAnchor,
		};
	}

	async saveScriptDraft(
		input: SaveProductionScriptDraftInput,
	): Promise<ProductionScriptDraftResult> {
		validateDraftInput(input);
		const current = await this.documents.readCurrent(input.editId);
		if (!current) throw new ProductionInputError(`Edit ${input.editId} was not found`);
		if (current.kind === "legacy") {
			throw new ProductionInputError("Admit the edit revision before saving a script draft");
		}
		if (!sameEditRevision(current.document.revision, input.expectedRevision)) {
			throw new EditRevisionConflictError({
				editId: input.editId,
				expected: input.expectedRevision,
				actual: current.document.revision,
			});
		}
		const state = productionState(current.document.project);
		const seen = new Set<string>();
		const shots: ProductionScriptDraftShot[] = [];
		for (const [index, shot] of input.shots.entries()) {
			const shotId = shot.shotId ?? `draft-shot-${(await digest([input.editId, index, shot])).slice(0, 24)}`;
			if (seen.has(shotId)) throw new ProductionInputError(`Shot ${shotId} appears more than once`);
			seen.add(shotId);
			shots.push({ shotId, narration: shot.narration, visualBrief: shot.visualBrief, motionBrief: shot.motionBrief ?? shot.visualBrief, durationMs: shot.durationMs });
		}
		const draft: ProductionScriptDraft = {
			script: input.script,
			shots,
			baseAcceptedReference: state.accepted ? structuredClone(state.accepted.reference) : null,
		};
		const saved = await this.documents.save({
			editId: input.editId,
			project: withProductionState(current.document.project, { ...state, draft }),
			expectedRevision: current.document.revision,
		});
		return { documentRevision: saved.revision, draft: structuredClone(draft) };
	}

	async acceptScriptDraft(
		input: AcceptProductionScriptDraftInput,
	): Promise<ProductionAcceptanceResult> {
		assertReference(input.editId, "Edit ID");
		assertReference(input.idempotencyKey, "Idempotency key");
		const current = await this.documents.readCurrent(input.editId);
		if (!current) throw new ProductionInputError(`Edit ${input.editId} was not found`);
		if (current.kind === "legacy") {
			throw new ProductionInputError("Admit the edit revision before accepting a script draft");
		}
		const state = productionState(current.document.project);
		const priorReceipt = state.acceptanceReceipts.find((receipt) => receipt.idempotencyKey === input.idempotencyKey);
		if (!state.draft) {
			if (priorReceipt) {
				const accepted = await this.readAcceptedRevision(priorReceipt.reference);
				const historical = await this.documents.readRevision({ editId: input.editId, intentRevision: priorReceipt.reference.documentIntentRevision });
				if (!accepted || !historical) throw new Error("Accepted production revision is unavailable");
				return { documentRevision: historical.revision, accepted };
			}
			throw new ProductionDraftRequiredError();
		}
		if (!sameEditRevision(current.document.revision, input.expectedRevision)) {
			throw new EditRevisionConflictError({ editId: input.editId, expected: input.expectedRevision, actual: current.document.revision });
		}
		return this.acceptRevision({
			editId: input.editId,
			expectedRevision: input.expectedRevision,
			baseAcceptedReference: state.draft.baseAcceptedReference,
			idempotencyKey: input.idempotencyKey,
			script: state.draft.script,
			shots: state.draft.shots.map((shot) => ({ ...shot, clientKey: shot.shotId })),
			allowNewShotIds: true,
		});
	}

	async readAcceptedRevision(
		reference: ProductionRevisionReference,
	): Promise<AcceptedProductionRevision | null> {
		validateRevisionReference(reference);
		const loaded = await this.documents.readRevision({
			editId: reference.editId,
			intentRevision: reference.documentIntentRevision,
		});
		if (!loaded) return null;
		const accepted = productionState(loaded.project).accepted;
		return accepted && sameReference(accepted.reference, reference)
			? accepted
			: null;
	}

	async acceptRevision(
		input: AcceptProductionInput,
	): Promise<ProductionAcceptanceResult> {
		validateAcceptInput(input);
		const current = await this.documents.readCurrent(input.editId);
		if (!current) throw new ProductionInputError(`Edit ${input.editId} was not found`);
		let state = productionState(
			current.kind === "document" ? current.document.project : current.project,
		);
		const requestDigest = await digest({
			script: input.script,
			shots: input.shots,
		});
		const priorReceipt = state.acceptanceReceipts.find(
			(receipt) => receipt.idempotencyKey === input.idempotencyKey,
		);
		if (priorReceipt) {
			if (priorReceipt.requestDigest !== requestDigest) {
				throw new ProductionIdempotencyError(input.idempotencyKey);
			}
			const accepted = await this.readAcceptedRevision(priorReceipt.reference);
			if (!accepted) throw new Error("Accepted production revision is unavailable");
			const historical = await this.documents.readRevision({
				editId: input.editId,
				intentRevision: priorReceipt.reference.documentIntentRevision,
			});
			if (!historical) throw new Error("Accepted document revision is unavailable");
			return { documentRevision: historical.revision, accepted };
		}
		if (
			current.kind === "document" &&
			input.expectedRevision !== null &&
			!sameEditRevision(current.document.revision, input.expectedRevision)
		) {
			throw new EditRevisionConflictError({
				editId: input.editId,
				expected: input.expectedRevision,
				actual: current.document.revision,
			});
		}
		if (
			current.kind === "legacy" &&
			(input.expectedRevision !== null ||
				input.expectedLegacyStorageCasRevision !== current.storageCasRevision)
		) {
			throw new ProductionInputError("The legacy edit changed before acceptance");
		}
		if (
			input.baseAcceptedReference !== undefined &&
			!sameNullableReference(input.baseAcceptedReference, state.accepted?.reference ?? null)
		) {
			throw new ProductionDraftStaleError({
				expected: input.baseAcceptedReference,
				actual: state.accepted?.reference ?? null,
			});
		}

		let loaded: LoadedProductionDocument;
		if (input.expectedRevision === null) {
			if (!input.expectedLegacyStorageCasRevision) {
				throw new ProductionInputError("Legacy storage revision is required");
			}
			loaded = await this.documents.admitLegacy({
				editId: input.editId,
				expectedStorageCasRevision: input.expectedLegacyStorageCasRevision,
			});
		} else if (current.kind === "document") {
			loaded = current.document;
		} else {
			throw new ProductionInputError("The edit changed before acceptance");
		}
		state = productionState(loaded.project);
		if (
			input.baseAcceptedReference !== undefined &&
			!sameNullableReference(input.baseAcceptedReference, state.accepted?.reference ?? null)
		) {
			throw new ProductionDraftStaleError({
				expected: input.baseAcceptedReference,
				actual: state.accepted?.reference ?? null,
			});
		}

		const shots = await buildShots({ input, previous: state.accepted });
		const contentDigest = await digest({
			script: input.script,
			shots,
			canvas: loaded.project.settings.canvasSize,
			fps: loaded.project.settings.fps,
		});
		const documentIntentRevision = nextIntentRevision(loaded.revision);
		const reference: ProductionRevisionReference = {
			editId: input.editId,
			documentIntentRevision,
			productionRevisionId: `production-${documentIntentRevision}-${contentDigest.slice(0, 16)}`,
			contentDigest,
		};
		const accepted: AcceptedProductionRevision = {
			reference,
			script: input.script,
			shots,
			targetDurationMs: shots.reduce((total, shot) => total + shot.durationMs, 0),
			canvas: structuredClone(loaded.project.settings.canvasSize),
			fps: structuredClone(loaded.project.settings.fps),
		};
		const nextState: ProductionState = {
			...state,
			accepted,
			acceptedHistory: state.accepted
				? [...(state.acceptedHistory ?? []), structuredClone(state.accepted)].slice(-MAX_VERSION_HISTORY)
				: state.acceptedHistory,
			dependencyGraph: dependencyGraphFor(accepted, state.dependencyGraph),
			acceptanceReceipts: [
				...state.acceptanceReceipts,
				{ idempotencyKey: input.idempotencyKey, requestDigest, reference },
			],
		};
		delete nextState.draft;
		if (nextState.acceptedHistory === undefined) delete nextState.acceptedHistory;
		const saved = await this.documents.save({
			editId: input.editId,
			project: withProductionState(loaded.project, nextState),
			expectedRevision: loaded.revision,
		});
		return { documentRevision: saved.revision, accepted };
	}

	async submitProductionIntent(
		input: SubmitProductionInput,
	): Promise<ProductionIntentResult> {
		validateRevisionReference(input.reference);
		assertReference(input.idempotencyKey, "Idempotency key");
		if (input.unresolvedQuestionRefs.length > MAX_QUESTION_REFS) {
			throw new ProductionInputError("Too many unresolved question references");
		}
		const questionRefs = [...new Set(input.unresolvedQuestionRefs)].sort();
		for (const reference of questionRefs) {
			assertReference(reference, "Question reference");
		}
		const current = await this.documents.readCurrent(input.reference.editId);
		if (!current || current.kind === "legacy") {
			throw new ProductionRevisionSupersededError(input.reference);
		}
		const loaded = current.document;
		const state = productionState(loaded.project);
		const requestDigest = await digest({
			acceptedRevision: canonicalProductionRevisionReference(input.reference),
			unresolvedQuestionRefs: questionRefs,
		});
		const priorIntent = state.actionIntents.find(
			(intent) => intent.idempotencyKey === input.idempotencyKey,
		);
		if (priorIntent) {
			if (priorIntent.requestDigest !== requestDigest) {
				throw new ProductionIdempotencyError(input.idempotencyKey);
			}
			const historical = await this.documents.readRevision({
				editId: input.reference.editId,
				intentRevision: priorIntent.documentIntentRevision,
			});
			if (!historical) throw new Error("Production intent revision is unavailable");
			return { documentRevision: historical.revision, intent: priorIntent };
		}
		if (
			!sameEditRevision(loaded.revision, input.expectedRevision) ||
			!state.accepted ||
			!sameReference(state.accepted.reference, input.reference)
		) {
			throw new ProductionRevisionSupersededError(input.reference);
		}

		const documentIntentRevision = nextIntentRevision(loaded.revision);
		const intent: ProductionActionIntent = {
			intentId: `intent-${(await digest(input.idempotencyKey)).slice(0, 24)}`,
			idempotencyKey: input.idempotencyKey,
			requestDigest,
			documentIntentRevision,
			acceptedRevision: canonicalProductionRevisionReference(input.reference),
			unresolvedQuestionRefs: questionRefs,
		};
		const saved = await this.documents.save({
			editId: input.reference.editId,
			project: withProductionState(loaded.project, {
				...state,
				actionIntents: [...state.actionIntents, intent],
			}),
			expectedRevision: loaded.revision,
		});
		return { documentRevision: saved.revision, intent };
	}

	async runWithAcceptedRevision<T>({
		reference,
		run,
	}: RunAcceptedInput<T>): Promise<T> {
		validateRevisionReference(reference);
		const current = await this.documents.readCurrent(reference.editId);
		const accepted =
			current?.kind === "document"
				? productionState(current.document.project).accepted
				: null;
		if (!accepted || !sameReference(accepted.reference, reference)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		return run(structuredClone(accepted));
	}

	async recordPendingJob({
		reference,
		expectedRevision,
		pendingJob,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		pendingJob: ProductionPendingJob;
	}): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const shot = state.accepted.shots.find((item) => item.shotId === pendingJob.shotId);
		if (!shot || shot.revision !== pendingJob.shotRevision || !sameReference(pendingJob.acceptedRevision, reference)) throw new ProductionInputError(`Pending ${pendingJob.role} job is not bound to the accepted shot`);
		const prior = state.accepted.pendingJobs ?? [];
		const existing = prior.find((item) => item.idempotencyKey === pendingJob.idempotencyKey);
		if (existing) {
			if (!samePendingJob(existing, pendingJob)) throw new ProductionIdempotencyError(pendingJob.idempotencyKey);
			return { documentRevision: current.document.revision, accepted: state.accepted };
		}
		const existingIdentity = prior.find((item) =>
			(item.status ?? "pending") === "pending" &&
			item.role === pendingJob.role &&
			item.shotId === pendingJob.shotId &&
			item.shotRevision === pendingJob.shotRevision &&
			sameReference(item.acceptedRevision, pendingJob.acceptedRevision),
		);
		if (existingIdentity) {
			return { documentRevision: current.document.revision, accepted: state.accepted };
		}
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		if (!nextState.accepted) throw new ProductionRevisionSupersededError(reference);
		nextState.accepted.pendingJobs = [...(nextState.accepted.pendingJobs ?? []), structuredClone(pendingJob)];
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) throw new Error(`Committed pending ${pendingJob.role} job for ${reference.editId} could not be read back`);
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async clearPendingJob({
		reference,
		expectedRevision,
		idempotencyKey,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		idempotencyKey: string;
	}): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		if (!(state.accepted.pendingJobs ?? []).some((job) => job.idempotencyKey === idempotencyKey)) return { documentRevision: current.document.revision, accepted: state.accepted };
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		if (!nextState.accepted) throw new ProductionRevisionSupersededError(reference);
		nextState.accepted.pendingJobs = nextState.accepted.pendingJobs?.filter((job) => job.idempotencyKey !== idempotencyKey);
		if (nextState.accepted.pendingJobs?.length === 0) delete nextState.accepted.pendingJobs;
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) throw new Error(`Cleared pending ${idempotencyKey} for ${reference.editId} could not be read back`);
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async markPendingJobFailed({
		reference,
		expectedRevision,
		idempotencyKey,
		reason,
		message,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		idempotencyKey: string;
		reason: NonNullable<ProductionPendingJob["failureReason"]>;
		message: string;
	}): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const pending = state.accepted.pendingJobs?.find((job) => job.idempotencyKey === idempotencyKey);
		if (!pending) return { documentRevision: current.document.revision, accepted: state.accepted };
		if (pending.status === "failed" && pending.failureReason === reason && pending.failureMessage === message) return { documentRevision: current.document.revision, accepted: state.accepted };
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		const nextPending = nextState.accepted?.pendingJobs?.find((job) => job.idempotencyKey === idempotencyKey);
		if (!nextPending) throw new ProductionRevisionSupersededError(reference);
		nextPending.status = "failed";
		nextPending.failureReason = reason;
		nextPending.failureMessage = message;
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) throw new Error(`Marked pending ${idempotencyKey} failed for ${reference.editId} could not be read back`);
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async recordImageCandidates({
		reference,
		expectedRevision,
		candidates,
		styleAnchor,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		candidates: ProductionImageCandidate[];
		styleAnchor?: ProductionStyleAnchor;
	}): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		if (candidates.length === 0) throw new ProductionInputError("No image candidates were supplied");
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document") {
			throw new ProductionRevisionSupersededError(reference);
		}
		if (!sameEditRevision(current.document.revision, expectedRevision)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		if (styleAnchor) nextState.styleAnchor = structuredClone(styleAnchor);
		for (const candidate of candidates) {
			const shot = nextState.accepted?.shots.find((item) => item.shotId === candidate.shotId);
			if (!shot || shot.revision !== candidate.shotRevision || !sameReference(candidate.acceptedRevision, reference)) {
				throw new ProductionInputError(`Image candidate ${candidate.shotId} is not bound to the accepted shot`);
			}
			const prior = shot.imageCandidates ?? [];
			const existing = prior.find((item) => item.idempotencyKey === candidate.idempotencyKey);
			if (existing) {
				if (!sameImageCandidate(existing, candidate)) {
					throw new ProductionIdempotencyError(candidate.idempotencyKey);
				}
				continue;
			}
			shot.imageCandidates = [...prior, structuredClone(candidate)];
		}
		project.settings.production = nextState;
		const saved = await this.documents.save({
			editId: reference.editId,
			project,
			expectedRevision,
		});
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) {
			throw new Error(`Committed image candidates for ${reference.editId} could not be read back`);
		}
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async recordAnimationCandidates({
		reference,
		expectedRevision,
		candidates,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		candidates: ProductionAnimationCandidate[];
	}): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		if (candidates.length === 0 || candidates.length > MAX_SHOTS) throw new ProductionInputError("Animation candidates are invalid");
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		for (const candidate of candidates) {
			const shot = nextState.accepted?.shots.find((item) => item.shotId === candidate.shotId);
			if (!shot || shot.revision !== candidate.shotRevision || !sameReference(candidate.acceptedRevision, reference) || !animationSourceMatches(shot.imageVersion, candidate.sourceImage)) {
				throw new ProductionInputError(`Animation candidate ${candidate.shotId} is not bound to the accepted still`);
			}
			const prior = shot.animationCandidates ?? [];
			const existing = prior.find((item) => item.idempotencyKey === candidate.idempotencyKey);
			if (existing) {
				if (!sameAnimationCandidate(existing, candidate)) throw new ProductionIdempotencyError(candidate.idempotencyKey);
				continue;
			}
			shot.animationCandidates = [...prior, structuredClone(candidate)].slice(-MAX_VERSION_HISTORY);
		}
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) throw new Error(`Committed animation candidates for ${reference.editId} could not be read back`);
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async attachMediaVersion({
		reference,
		expectedRevision,
		shotId,
		shotRevision,
		role,
		version,
		idempotencyKey,
	}: ProductionMediaAttachmentInput): Promise<ProductionAcceptanceResult> {
		validateRevisionReference(reference);
		assertReference(idempotencyKey, "Import idempotency key");
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document") {
			throw new ProductionRevisionSupersededError(reference);
		}
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const shot = state.accepted.shots.find((item) => item.shotId === shotId);
		if (!shot || shot.revision !== shotRevision) {
			throw new ProductionInputError(`Shot ${shotId} is not the accepted shot revision`);
		}
		const prior = role === "visual" ? shot.imageVersion : role === "animation" ? shot.animationVersion : shot.narrationVersion;
		if (prior) {
			const priorKey = prior.idempotencyKey;
			if (priorKey === idempotencyKey || prior.mediaId === version.mediaId) {
				return { documentRevision: current.document.revision, accepted: state.accepted };
			}
		}
		if (!sameEditRevision(current.document.revision, expectedRevision)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		const nextShot = nextState.accepted?.shots.find((item) => item.shotId === shotId);
		if (!nextShot) throw new ProductionInputError(`Shot ${shotId} is unavailable`);
		if (role === "visual") {
			if (prior && isNarrationVersion(prior)) throw new ProductionInputError("Visual media version is incomplete");
			if (prior && prior.mediaId !== version.mediaId) {
				nextShot.imageVersionHistory = [
					...(nextShot.imageVersionHistory ?? []),
					structuredClone(prior),
				].slice(-MAX_VERSION_HISTORY);
			}
			nextShot.imageVersion = cloneMediaVersion(version);
		} else if (role === "animation") {
			if (version.mediaType !== "video" || !("sourceImage" in version)) throw new ProductionInputError("Animation media version is incomplete");
			if (!animationSourceMatches(nextShot.imageVersion, version.sourceImage)) throw new ProductionInputError("Animation source image is no longer the accepted still");
			const priorAnimation = prior && !isNarrationVersion(prior) && prior.mediaType === "video" && "sourceImage" in prior
				? prior as ProductionAnimationVersion
				: undefined;
			if (priorAnimation && priorAnimation.mediaId !== version.mediaId) {
				nextShot.animationVersionHistory = [
					...(nextShot.animationVersionHistory ?? []),
					structuredClone(priorAnimation),
				].slice(-MAX_VERSION_HISTORY);
			}
			nextShot.animationVersion = cloneMediaVersion(version) as ProductionAnimationVersion;
		} else {
			if (!("alignment" in version)) throw new ProductionInputError("Narration media version is incomplete");
			if (prior && !isNarrationVersion(prior)) throw new ProductionInputError("Narration media version is incomplete");
			const priorNarration = prior && isNarrationVersion(prior) ? prior : undefined;
			if (priorNarration && priorNarration.mediaId !== version.mediaId) {
				nextShot.narrationVersionHistory = [
					...(nextShot.narrationVersionHistory ?? []),
					structuredClone(priorNarration),
				].slice(-MAX_VERSION_HISTORY);
			}
			nextShot.narrationVersion = cloneMediaVersion(version);
		}
		if (nextState.accepted) nextState.dependencyGraph = dependencyGraphFor(nextState.accepted, nextState.dependencyGraph);
		project.settings.production = nextState;
		const saved = await this.documents.save({
			editId: reference.editId,
			project,
			expectedRevision,
		});
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) {
			throw new Error(`Committed media version for ${reference.editId} could not be read back`);
		}
		return { documentRevision: readback.document.revision, accepted: productionState(readback.document.project).accepted! };
	}

	async acceptAnimationVersion({
		reference,
		expectedRevision,
		shotId,
		shotRevision,
		idempotencyKey,
		candidateId,
		useVersion,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		shotId: string;
		shotRevision: number;
		idempotencyKey: string;
		candidateId?: string;
		useVersion?: string;
	}): Promise<ProductionAcceptanceResult> {
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const shot = state.accepted.shots.find((item) => item.shotId === shotId);
		if (!shot || shot.revision !== shotRevision) throw new ProductionInputError(`Shot ${shotId} is not the accepted shot revision`);
		const candidates = shot.animationCandidates ?? [];
		let selected: ProductionAnimationVersion | undefined;
		if (candidateId !== undefined) {
			const candidate = candidates.find((item) => item.idempotencyKey === candidateId);
			if (candidate) selected = animationVersion(candidate);
		}
		else if (useVersion !== undefined) {
			selected = (shot.animationVersionHistory ?? []).find((version) => version.mediaId === useVersion || version.mediaRevision === useVersion || version.idempotencyKey === useVersion);
			if (!selected) {
				const candidate = candidates.find((item) => item.idempotencyKey === useVersion || item.mediaId === useVersion || item.mediaRevision === useVersion);
				if (candidate) selected = animationVersion(candidate);
			}
		} else if (candidates.length === 1) selected = animationVersion(candidates[0]!);
		if (!selected) {
			if (candidates.length > 1) throw new ProductionInputError("Select one animation candidate before accepting it");
			throw new ProductionInputError("The requested animation version was not found");
		}
		return this.attachMediaVersion({ reference, expectedRevision, shotId, shotRevision, role: "animation", version: selected, idempotencyKey });
	}

	async commitRegenerationCandidates({
		reference,
		expectedRevision,
		requestDigest,
		idempotencyKey,
		candidates,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		requestDigest: string;
		idempotencyKey: string;
		candidates: ProductionRegenerationCandidate[];
	}): Promise<{ documentRevision: EditRevision; accepted: AcceptedProductionRevision; candidates: ProductionRegenerationCandidate[] }> {
		validateRevisionReference(reference);
		assertReference(idempotencyKey, "Regeneration idempotency key");
		assertReference(requestDigest, "Regeneration request digest");
		if (candidates.length === 0 || candidates.length > MAX_SHOTS) {
			throw new ProductionInputError("Regeneration candidates are invalid");
		}
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const priorReceipt = state.regenerationReceipts?.find((receipt) => receipt.idempotencyKey === idempotencyKey);
		if (priorReceipt) {
			if (priorReceipt.requestDigest !== requestDigest) throw new ProductionIdempotencyError(idempotencyKey);
			return {
				documentRevision: current.document.revision,
				accepted: state.accepted,
				candidates: (state.regenerationCandidates ?? []).filter((candidate) =>
					priorReceipt.candidateIds.includes(candidate.candidateId)),
			};
		}
		const shotRoles = new Set<string>();
		for (const candidate of candidates) {
			assertReference(candidate.candidateId, "Candidate ID");
			if (!sameReference(candidate.acceptedRevision, reference)) throw new ProductionInputError("Candidate revision is stale");
			if (!Number.isSafeInteger(candidate.shotRevision) || candidate.shotRevision < 1) throw new ProductionInputError("Candidate shot revision is invalid");
			const shot = state.accepted.shots.find((item) => item.shotId === candidate.shotId);
			const shotRole = `${candidate.shotId}:${candidate.role}`;
			if (!shot || shot.revision !== candidate.shotRevision || shotRoles.has(shotRole)) {
				throw new ProductionInputError(`Candidate ${candidate.shotId} is not an accepted shot`);
			}
			shotRoles.add(shotRole);
		}
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		const existing = nextState.regenerationCandidates ?? [];
		const byId = new Map(existing.map((candidate) => [candidate.candidateId, candidate]));
		for (const candidate of candidates) {
			const previous = byId.get(candidate.candidateId);
			if (previous && !sameRegenerationCandidate(previous, candidate)) throw new ProductionIdempotencyError(candidate.candidateId);
			const nextCandidate = structuredClone(candidate);
			if (nextCandidate.brief === undefined) delete nextCandidate.brief;
			nextCandidate.version = cloneMediaVersion(nextCandidate.version);
			byId.set(candidate.candidateId, nextCandidate);
		}
		nextState.regenerationCandidates = [...byId.values()].slice(-MAX_REGENERATION_CANDIDATES);
		nextState.regenerationReceipts = [
			...(nextState.regenerationReceipts ?? []),
			{ idempotencyKey, requestDigest, acceptedRevision: canonicalProductionRevisionReference(reference), candidateIds: candidates.map((candidate) => candidate.candidateId) },
		].slice(-MAX_REGENERATION_CANDIDATES);
		nextState.dependencyGraph = dependencyGraphFor(state.accepted, state.dependencyGraph);
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		const readback = await this.documents.readCurrent(reference.editId);
		if (readback?.kind !== "document" || !sameEditRevision(readback.document.revision, saved.revision)) {
			throw new Error(`Committed regeneration candidates for ${reference.editId} could not be read back`);
		}
		const resultState = productionState(readback.document.project);
		return { documentRevision: readback.document.revision, accepted: resultState.accepted!, candidates: candidates.map((candidate) => structuredClone(candidate)) };
	}

	async acceptRegenerationVersion({
		reference,
		expectedRevision,
		shotId,
		shotRevision,
		role,
		idempotencyKey,
		candidateId,
		useVersion,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		shotId: string;
		shotRevision: number;
		role: "visual" | "narration";
		idempotencyKey: string;
		candidateId?: string;
		useVersion?: string;
	}): Promise<ProductionAcceptanceResult> {
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) {
			throw new ProductionRevisionSupersededError(reference);
		}
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const shot = state.accepted.shots.find((item) => item.shotId === shotId);
		if (!shot || shot.revision !== shotRevision) throw new ProductionInputError(`Shot ${shotId} is not the accepted shot revision`);
		const candidates = (state.regenerationCandidates ?? []).filter((candidate) =>
			candidate.shotId === shotId && candidate.shotRevision === shotRevision && candidate.role === role);
		let selected: ProductionMediaVersion | ProductionNarrationVersion | undefined;
		if (candidateId !== undefined) selected = candidates.find((candidate) => candidate.candidateId === candidateId)?.version;
		else if (useVersion !== undefined) {
			if (role === "visual") {
				selected = (shot.imageVersionHistory ?? []).find((version) => version.mediaId === useVersion || version.mediaRevision === useVersion || version.idempotencyKey === useVersion);
			} else {
				selected = (shot.narrationVersionHistory ?? []).find((version) => version.mediaId === useVersion || version.mediaRevision === useVersion || version.idempotencyKey === useVersion);
			}
			if (!selected) selected = candidates.find((candidate) => candidate.candidateId === useVersion)?.version;
		} else if (candidates.length === 1) selected = candidates[0]?.version;
		if (!selected) {
			if (candidates.length > 1) throw new ProductionInputError("Select one candidate version before accepting it");
			throw new ProductionInputError("The requested production version was not found");
		}
		if (role === "visual" && selected.mediaType !== "image") throw new ProductionInputError("Visual version has the wrong media type");
		if (role === "narration" && !("alignment" in selected)) throw new ProductionInputError("Narration version is incomplete");
		return this.attachMediaVersion({
			reference,
			expectedRevision,
			shotId,
			shotRevision,
			role,
			version: selected,
			idempotencyKey,
		});
	}

	async recordDependencyGraph({
		reference,
		expectedRevision,
		graph,
	}: {
		reference: ProductionRevisionReference;
		expectedRevision: EditRevision;
		graph: ProductionDependencyGraph;
	}): Promise<ProductionAcceptanceResult> {
		if (!sameReference(graph.acceptedRevision, reference)) throw new ProductionInputError("Dependency graph revision is stale");
		const current = await this.documents.readCurrent(reference.editId);
		if (current?.kind !== "document" || !sameEditRevision(current.document.revision, expectedRevision)) throw new ProductionRevisionSupersededError(reference);
		const state = productionState(current.document.project);
		if (!state.accepted || !sameReference(state.accepted.reference, reference)) throw new ProductionRevisionSupersededError(reference);
		const project = structuredClone(current.document.project);
		const nextState = productionState(project);
		nextState.dependencyGraph = cloneDependencyGraph(graph);
		project.settings.production = nextState;
		const saved = await this.documents.save({ editId: reference.editId, project, expectedRevision });
		return { documentRevision: saved.revision, accepted: nextState.accepted! };
	}
}

export function deriveAcceptedPlacementInput({
	editId,
	expectedRevision,
	accepted,
	idempotencyKey,
}: {
	editId: string;
	expectedRevision: EditRevision;
	accepted: AcceptedProductionRevision;
	idempotencyKey: string;
}): import("@/timeline/production-placement").ProductionPlacementInput {
	let startSeconds = 0;
	const shots = accepted.shots.flatMap((shot) => {
		const durationSeconds = shot.durationMs / 1000;
		const shotStartSeconds = startSeconds;
		startSeconds += durationSeconds;
		const visualVersion = shot.animationVersion ?? shot.imageVersion;
		const visual = visualVersion
			? {
					mediaId: visualVersion.mediaId,
					mediaRevision: visualVersion.mediaRevision,
					mediaType: visualVersion.mediaType === "video" ? "video" as const : "image" as const,
					name: visualVersion.name,
					sourceDurationSeconds: visualVersion.mediaType === "video"
						? visualVersion.sourceDurationSeconds
						: durationSeconds,
					trimStartSeconds: 0,
					trimEndSeconds: visualVersion.mediaType === "video"
						? Math.max(0, visualVersion.sourceDurationSeconds - durationSeconds)
						: 0,
				}
			: undefined;
		const narration = shot.narrationVersion
			? {
					mediaId: shot.narrationVersion.mediaId,
					mediaRevision: shot.narrationVersion.mediaRevision,
					acceptedShotId: shot.shotId,
					acceptedShotRevision: shot.revision,
					name: shot.narrationVersion.name,
					sourceDurationSeconds: shot.narrationVersion.sourceDurationSeconds,
					trimStartSeconds: 0,
					trimEndSeconds: 0,
					timelineOffsetSeconds: 0,
					alignment: {
						mediaId: shot.narrationVersion.mediaId,
						mediaRevision: shot.narrationVersion.mediaRevision,
						segments: structuredClone(shot.narrationVersion.alignment),
					},
				}
			: undefined;
		if (!visual && !narration) return [];
		const placement: ProductionShotPlacementInput = {
			shotId: shot.shotId,
			shotRevision: shot.revision,
			startSeconds: shotStartSeconds,
			durationSeconds,
		};
		if (visual) placement.visual = visual;
		if (narration) placement.narration = narration;
		return [placement];
	});
	return { editId, expectedRevision: canonicalEditRevision(expectedRevision), acceptedRevision: canonicalProductionRevisionReference(accepted.reference), idempotencyKey, shots };
}

export const productionService = new ProductionService();
