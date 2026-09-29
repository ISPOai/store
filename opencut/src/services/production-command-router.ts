import type { ProductionDocumentService } from "@/project/production-document-service";
import type { CommandResourceDelivery, ProjectCommandSdk } from "@ispo/sdk";
import type {
	EditRevision,
	LoadedProductionDocument,
	ProductionDocumentCurrentRead,
} from "@/project/production-types";
import { EditRevisionConflictError } from "@/project/production-types";
import type { SerializedProject } from "@/services/storage/types";
import type {
	ProductionRenderArtifact,
	ProductionRenderInput,
	ProductionRenderResult,
} from "@/export/production-render-operation";
import type {
	ProductionImageInput,
	ProductionNarrationInput,
	ProductionImageModelPin,
	ProductionImportInput,
	ProductionListMediaCommandResult,
	ProductionMediaListItem,
	ProductionMediaVersionView,
	ProductionRegenerateInput,
	ProductionAcceptVersionInput,
	ProductionTargetInput,
	ProductionTargetsCommandResult,
	ProductionRegenerateCommandResult,
	ProductionAcceptVersionCommandResult,
	ProductionScriptCommandResult,
} from "./project-command-types";
import { runProductionScriptCommand } from "@/project/production-script-command";
import {
	ProductionRegenerationService,
	type ProductionImageRegenerator,
} from "@/project/production-regeneration";
import { ProductionService, deriveAcceptedPlacementInput } from "@/project/production-service";
import { ProductionPlacementService } from "@/timeline/production-placement";
import { runProductionImageCommand } from "./project-image-command";
import type { ProductionNarrationSdk } from "./project-narration-command";
import type {
	AcceptedProductionShot,
	ProductionAnimationCandidate,
	ProductionImageCandidate,
	ProductionMediaVersion,
	ProductionRegenerationCandidate,
} from "@/project/production-types";

export type ProductionCommandOperation =
	| "inspect-edit"
	| "list-edits"
	| "rename-edit"
	| "list-media"
	| "arrange-timeline"
	| "transcribe-media"
	| "export-project"
	| "production-image"
	| "production-narration"
	| "production-import"
	| "production-targets"
	| "production-regenerate"
	| "production-accept-version"
	| "production-script";

export interface ProductionCommandInput {
	operation: ProductionCommandOperation;
	scriptOperation?: "read" | "save-draft" | "accept";
	editId?: string;
	expectedRevision?: EditRevision;
	name?: string;
	format?: "mp4" | "webm" | "mov" | "gif" | "mp3" | "wav";
	quality?: "low" | "medium" | "high" | "very_high";
	includeAudio?: boolean;
	resolution?: { width: number; height: number };
	fps?: number;
	bitrate?: number;
	movCodec?: "h264" | "prores";
	acceptedRevision?: {
		editId: string;
		documentIntentRevision: string;
		productionRevisionId: string;
		contentDigest: string;
	};
	shotIds?: string[];
	attempt?: number;
	newVersion?: boolean;
	model?: ProductionImageModelPin;
	strength?: number;
	references?: ProductionImageInput["references"];
	styleAnchor?: ProductionImageInput["styleAnchor"];
	voice?: ProductionNarrationInput["voice"];
	shotId?: string;
	shotRevision?: number;
	role?: "visual" | "video" | "narration";
	idempotencyKey?: string;
	durationMs?: number;
	voiceboxGenerationRef?: string;
	publishedFiles?: { publicId: string; path?: string; revision?: string };
	sourcePublicId?: string;
	alignment?: Array<{ text: string; start: number; end: number }>;
	changes?: ProductionRegenerateInput["changes"];
	candidateId?: string;
	useVersion?: string;
	script?: string;
	scriptShots?: Array<{
		shotId?: string;
		narration: string;
		visualBrief: string;
		targetDurationSeconds: number;
	}>;
}

type ProductionCommandStatus = "completed" | "pending" | "refused";
type ProductionCommandRefusal =
	| "capability-unavailable"
	| "edit-not-found"
	| "expected-revision-required"
	| "input-invalid"
	| "legacy-revision-required"
	| "revision-conflict"
	| "render-failed"
	| "accepted-source-mismatch"
	| "producer-failed"
	| "producer-timeout";

interface ProductionEditSummary {
	name: string;
	sceneCount: number;
	timelineElementCount: number;
	duration: number;
	canvasWidth: number;
	canvasHeight: number;
	fpsNumerator: number;
	fpsDenominator: number;
}

interface ProductionCommandData {
	supported: boolean;
	status: ProductionCommandStatus;
	operation: ProductionCommandOperation;
	editId: string;
	message: string;
	reason?: ProductionCommandRefusal;
	revision?: EditRevision;
	legacyStorageCasRevision?: string;
	edit?: ProductionEditSummary;
	operationId?: string;
	artifact?: ProductionRenderArtifact;
	shots?: Array<{ shotId: string; publicId: string; path: string; digest: string }>;
	media?: { mediaId: string; mediaRevision: string; shotId: string; role: "visual" | "video" | "narration" };
	edits?: Array<{ editId: string; name: string; updatedAt: string; active: boolean }>;
	activeEditSource?: "storage" | "most-recent";
}

interface BaseProductionCommandResult {
	kind: "json";
	data: ProductionCommandData;
}

export type ProductionCommandResult = BaseProductionCommandResult |
	ProductionListMediaCommandResult |
	ProductionTargetsCommandResult |
	ProductionRegenerateCommandResult |
	ProductionAcceptVersionCommandResult |
	ProductionScriptCommandResult;

export interface ProductionCommandContext {
	sdk: ProjectCommandSdk;
	resources?: readonly CommandResourceDelivery[];
	signal?: AbortSignal;
}

type ProductionDocuments = Pick<
	ProductionDocumentService,
	"admitLegacy" | "readCurrent" | "readRevision" | "save" | "listEdits"
>;

const MAX_EDIT_ID_LENGTH = 256;
const MAX_PROJECT_NAME_LENGTH = 200;
const MAX_MEDIA_SHOTS = 100;

function assertEditId(
	input: ProductionCommandInput,
): asserts input is ProductionCommandInput & { editId: string } {
	if (input.editId === undefined) throw new Error("A bounded editId is required.");
}

function timelineElementCount(project: SerializedProject): number {
	let count = 0;
	for (const scene of project.scenes) {
		count += scene.tracks.main.elements.length;
		for (const track of scene.tracks.overlay) count += track.elements.length;
		for (const track of scene.tracks.audio) count += track.elements.length;
	}
	return count;
}

function summarize(project: SerializedProject): ProductionEditSummary {
	return {
		name: project.metadata.name,
		sceneCount: project.scenes.length,
		timelineElementCount: timelineElementCount(project),
		duration: project.metadata.duration,
		canvasWidth: project.settings.canvasSize.width,
		canvasHeight: project.settings.canvasSize.height,
		fpsNumerator: project.settings.fps.numerator,
		fpsDenominator: project.settings.fps.denominator,
	};
}

function response(data: ProductionCommandData): ProductionCommandResult {
	return { kind: "json", data };
}

function invalidInput(
	input: ProductionCommandInput,
	message: string,
): ProductionCommandResult {
	return response({
		supported: true,
		status: "refused",
		operation: input.operation,
		editId: input.editId ?? "",
		message,
		reason: "input-invalid",
	});
}

function unavailable(input: ProductionCommandInput): ProductionCommandResult {
	return response({
		supported: false,
		status: "refused",
		operation: input.operation,
		editId: input.editId ?? "",
		message: `${input.operation} is not available from OpenCut's headless command service yet.`,
		reason: "capability-unavailable",
	});
}

function currentRevision(
	current: ProductionDocumentCurrentRead,
): EditRevision | undefined {
	return current.kind === "document" ? current.document.revision : undefined;
}

function editNotFound(input: ProductionCommandInput): ProductionCommandResult {
	return response({
		supported: true,
		status: "refused",
		operation: input.operation,
		editId: input.editId ?? "",
		message: `Edit ${input.editId ?? ""} was not found.`,
		reason: "edit-not-found",
	});
}

function filesReference(
	version: ProductionMediaVersion,
): ProductionMediaVersionView["filesRef"] | undefined {
	if (version.filesRef) return structuredClone(version.filesRef);
	if ("publishedFiles" in version && version.publishedFiles) {
		return structuredClone(version.publishedFiles);
	}
	return undefined;
}

function versionView(
	version: ProductionMediaVersion,
	defaultDurationSeconds?: number,
): ProductionMediaVersionView {
	const durationSeconds = version.sourceDurationSeconds > 0
		? version.sourceDurationSeconds
		: defaultDurationSeconds;
	const view: ProductionMediaVersionView = {
		versionId: version.mediaRevision || version.mediaId || version.idempotencyKey || "version",
		mediaId: version.mediaId,
		mediaRevision: version.mediaRevision,
		name: version.name,
		mediaType: version.mediaType,
	};
	const filesRef = filesReference(version);
	if (filesRef) view.filesRef = filesRef;
	if (version.dimensions) view.dimensions = structuredClone(version.dimensions);
	if (durationSeconds !== undefined && durationSeconds > 0) view.durationSeconds = durationSeconds;
	if (version.references) view.references = version.references.map(({ name }) => ({ name }));
	if (version.styleAnchorRevision) view.styleAnchorRevision = version.styleAnchorRevision;
	return view;
}

function candidateView(
	candidateId: string,
	version: ProductionMediaVersion,
	defaultDurationSeconds?: number,
): ProductionMediaVersionView & { candidateId: string } {
	return { candidateId, ...versionView(version, defaultDurationSeconds) };
}

function imageCandidateView(
	candidate: ProductionImageCandidate,
	durationSeconds: number,
): ProductionMediaVersionView & { candidateId: string } {
	const view: ProductionMediaVersionView & { candidateId: string } = {
		candidateId: candidate.candidateId ?? candidate.idempotencyKey,
		versionId: candidate.version?.mediaRevision ?? candidate.resource.digest,
		mediaId: candidate.mediaId ?? candidate.resource.publicId,
		mediaRevision: candidate.version?.mediaRevision ?? candidate.resource.digest,
		name: candidate.resource.path.split("/").pop() || `${candidate.shotId}.png`,
		mediaType: "image",
		filesRef: { publicId: candidate.resource.publicId, path: candidate.resource.path },
		dimensions: structuredClone(candidate.resource.dimensions),
		...(durationSeconds > 0 ? { durationSeconds } : {}),
	};
	if (candidate.model) view.model = structuredClone(candidate.model);
	if (candidate.references) view.references = candidate.references.map(({ name }) => ({ name }));
	if (candidate.styleAnchorRevision) view.styleAnchorRevision = candidate.styleAnchorRevision;
	return view;
}

function animationCandidateView(
	candidate: ProductionAnimationCandidate,
): ProductionMediaVersionView & { candidateId: string } {
	return {
		candidateId: candidate.candidateId ?? candidate.idempotencyKey,
		versionId: candidate.version?.mediaRevision ?? candidate.mediaRevision,
		mediaId: candidate.mediaId,
		mediaRevision: candidate.version?.mediaRevision ?? candidate.mediaRevision,
		name: candidate.resource.path.split("/").pop() || `${candidate.shotId}.mp4`,
		mediaType: "video",
		filesRef: { publicId: candidate.resource.publicId, path: candidate.resource.path },
		dimensions: structuredClone(candidate.resource.dimensions),
		durationSeconds: candidate.resource.durationSeconds,
	};
}

function narrationCandidates(
	shot: AcceptedProductionShot,
	regenerationCandidates: ProductionRegenerationCandidate[],
): Array<ProductionMediaVersionView & { candidateId: string }> {
	const candidates = (shot.narrationCandidates ?? []).map((version) =>
		candidateView(
			version.candidateId ?? version.idempotencyKey ?? version.mediaRevision,
			version,
		),
	);
	for (const candidate of regenerationCandidates) {
		if (candidate.shotId !== shot.shotId || candidate.role !== "narration") continue;
		candidates.push(candidateView(candidate.candidateId, candidate.version));
	}
	return candidates;
}

function mediaListForShot(
	shot: AcceptedProductionShot,
	regenerationCandidates: ProductionRegenerationCandidate[],
): ProductionMediaListItem[] {
	const durationSeconds = shot.durationMs / 1000;
	const media: ProductionMediaListItem[] = [];
	const visualCandidates = [
		...(shot.imageCandidates ?? []).map((candidate) =>
			imageCandidateView(candidate, durationSeconds),
		),
		...regenerationCandidates
			.filter((candidate) => candidate.shotId === shot.shotId && candidate.role === "visual")
			.map((candidate) => candidateView(candidate.candidateId, candidate.version, durationSeconds)),
		...(shot.animationCandidates ?? []).map((candidate) => animationCandidateView(candidate)),
	];
	if (shot.imageVersion || shot.animationVersion || visualCandidates.length > 0) {
		media.push({
			shotId: shot.shotId,
			shotRevision: String(shot.revision),
			role: "visual",
			...((shot.animationVersion ?? shot.imageVersion) ? { accepted: versionView(shot.animationVersion ?? shot.imageVersion!, durationSeconds) } : {}),
			candidates: visualCandidates,
		});
	}
	const audioCandidates = narrationCandidates(shot, regenerationCandidates);
	if (shot.narrationVersion || audioCandidates.length > 0) {
		media.push({
			shotId: shot.shotId,
			shotRevision: String(shot.revision),
			role: "narration",
			...(shot.narrationVersion ? { accepted: versionView(shot.narrationVersion) } : {}),
			candidates: audioCandidates,
		});
	}
	return media;
}

function inspectResult(
	input: ProductionCommandInput,
	current: ProductionDocumentCurrentRead,
): ProductionCommandResult {
	assertEditId(input);
	const project = current.kind === "document"
		? current.document.project
		: current.project;
	return response({
		supported: true,
		status: "completed",
		operation: input.operation,
		editId: input.editId,
		message: `Read edit ${input.editId}.`,
		...(current.kind === "document"
			? { revision: current.document.revision }
			: { legacyStorageCasRevision: current.storageCasRevision }),
		edit: summarize(project),
	});
}

function renameRefusal({
	input,
	current,
	reason,
	message,
}: {
	input: ProductionCommandInput;
	current: ProductionDocumentCurrentRead;
	reason: ProductionCommandRefusal;
	message: string;
}): ProductionCommandResult {
	assertEditId(input);
	const revision = currentRevision(current);
	const data: ProductionCommandData = {
		supported: true,
		status: "refused",
		operation: input.operation,
		editId: input.editId,
		message,
		reason,
	};
	if (revision) data.revision = revision;
	if (current.kind === "legacy") {
		data.legacyStorageCasRevision = current.storageCasRevision;
	}
	return response(data);
}

function sameRevision(left: EditRevision, right: EditRevision): boolean {
	return (
		left.editId === right.editId &&
		left.intentRevision === right.intentRevision &&
		left.digest === right.digest
	);
}

function projectWithName(
	project: SerializedProject,
	name: string,
): SerializedProject {
	return {
		...structuredClone(project),
		metadata: { ...structuredClone(project.metadata), name },
	};
}

function sameProject(left: SerializedProject, right: SerializedProject): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isImmediateSuccessor(current: string, expected: string): boolean {
	const currentNumber = Number(current);
	const expectedNumber = Number(expected);
	return (
		Number.isSafeInteger(currentNumber) &&
		Number.isSafeInteger(expectedNumber) &&
		currentNumber > 0 &&
		expectedNumber > 0 &&
		String(currentNumber) === current &&
		String(expectedNumber) === expected &&
		currentNumber === expectedNumber + 1
	);
}

export class ProductionCommandRouter {
	constructor(
		private readonly documents: ProductionDocuments,
		private readonly render?: {
			run(input: ProductionRenderInput): Promise<ProductionRenderResult>;
		},
	) {}

	async run(input: ProductionCommandInput, context?: ProductionCommandContext): Promise<ProductionCommandResult> {
		if (input.operation === "list-edits") return this.listEdits();
		if (
			input.operation === "production-script" &&
			(input.scriptOperation ?? "read") === "read" &&
			input.editId === undefined
		) {
			if (!context) return unavailable(input);
			return runProductionScriptCommand({
				operation: "read",
				expectedRevision: input.expectedRevision,
				script: input.script,
				shots: input.scriptShots,
				idempotencyKey: input.idempotencyKey,
			}, context.sdk);
		}
		if (input.editId === undefined) {
			if (input.operation === "inspect-edit") {
				const listing = await this.documents.listEdits();
				if (listing.activeEditId) input = { ...input, editId: listing.activeEditId };
			}
		}
		if (input.editId === undefined) return invalidInput(input, "A bounded editId is required.");
		assertEditId(input);
		if (
			input.editId.trim().length === 0 ||
			input.editId.length > MAX_EDIT_ID_LENGTH
		) {
			return invalidInput(input, "A bounded editId is required.");
		}
		if (input.operation === "inspect-edit") return this.inspect(input);
		if (input.operation === "list-media") return this.listMedia(input);
		if (input.operation === "rename-edit") return this.rename(input);
		if (input.operation === "arrange-timeline") return this.arrange(input);
		if (input.operation === "export-project") return this.export(input);
		if (input.operation === "production-script") {
			if (!context) return unavailable(input);
			return runProductionScriptCommand({
				operation: input.scriptOperation ?? "read",
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				script: input.script,
				shots: input.scriptShots,
				idempotencyKey: input.idempotencyKey,
			}, context.sdk);
		}
		if (input.operation === "production-targets") {
			if (!input.expectedRevision || !input.acceptedRevision) return invalidInput(input, "production-targets requires an expected and accepted revision.");
			const targetInput: ProductionTargetInput = {
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				acceptedRevision: input.acceptedRevision,
			};
			if (input.shotIds) targetInput.shotIds = input.shotIds;
			return (context
				? new ProductionRegenerationService(this.documents, undefined, { sdk: context.sdk, resources: context.resources ?? [] })
				: new ProductionRegenerationService(this.documents)).targets(targetInput);
		}
		if (input.operation === "production-accept-version") {
			if (!input.expectedRevision || !input.acceptedRevision || !input.shotId || input.shotRevision === undefined || !input.role || input.role === "video" || !input.idempotencyKey) return invalidInput(input, "production-accept-version requires its revision, shot, role, and idempotency key.");
			const acceptInput: ProductionAcceptVersionInput = {
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				acceptedRevision: input.acceptedRevision,
				shotId: input.shotId,
				shotRevision: input.shotRevision,
				role: input.role,
				idempotencyKey: input.idempotencyKey,
			};
			if (input.candidateId !== undefined) acceptInput.candidateId = input.candidateId;
			if (input.useVersion !== undefined) acceptInput.useVersion = input.useVersion;
			if (!context) return new ProductionRegenerationService(this.documents, undefined, undefined, true).acceptVersion(acceptInput);
			return new ProductionRegenerationService(this.documents, undefined, { sdk: context.sdk, resources: context.resources ?? [] }, true).acceptVersion(acceptInput);
		}
		if (input.operation === "production-regenerate") {
			if (!context || !input.expectedRevision || !input.acceptedRevision || !input.changes || !input.idempotencyKey) return invalidInput(input, "production-regenerate requires its revision, change set, and idempotency key.");
			const imageRegenerator: ProductionImageRegenerator = {
				generate: async (request) => {
					const current = await new ProductionService(this.documents).load(request.editId);
					if (!current?.documentRevision) throw new Error("The edit revision is unavailable");
					const result = await runProductionImageCommand({
						editId: request.editId,
						expectedRevision: current.documentRevision,
						acceptedRevision: request.acceptedRevision,
						shotIds: [request.shotId],
						attempt: request.attempt,
						visualBrief: request.brief,
						model: input.model,
						strength: input.strength,
						references: request.references,
						styleAnchor: input.styleAnchor,
					}, context.sdk, undefined, context.signal);
					if (result.data.status !== "completed") throw new Error(result.data.message);
					const publicId = result.data.shots?.[0]?.publicId;
					const latest = await new ProductionService(this.documents).load(request.editId);
					return latest?.accepted?.shots.find((shot) => shot.shotId === request.shotId)?.imageCandidates?.find((candidate) => candidate.resource.publicId === publicId) ?? null;
				},
			};
			const regenerateInput: ProductionRegenerateInput = {
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				acceptedRevision: input.acceptedRevision,
				idempotencyKey: input.idempotencyKey,
				changes: input.changes,
			};
			if (input.attempt !== undefined) regenerateInput.attempt = input.attempt;
				if (input.model !== undefined) regenerateInput.model = input.model;
				if (input.strength !== undefined) regenerateInput.strength = input.strength;
				if (input.references !== undefined) regenerateInput.references = input.references;
				if (input.styleAnchor !== undefined) regenerateInput.styleAnchor = input.styleAnchor;
			return new ProductionRegenerationService(this.documents, imageRegenerator).regenerate(regenerateInput);
		}
		if (input.operation === "production-image" || input.operation === "production-narration" || input.operation === "production-import") {
			if (!context) return unavailable(input);
			if (input.operation === "production-image") {
				if (!input.expectedRevision || !input.acceptedRevision || !input.shotIds || input.attempt === undefined) {
					return invalidInput(input, "production-image requires an expected revision, accepted revision, shot IDs, and attempt.");
				}
				const { runProductionImageCommand } = await import("./project-image-command");
				const imageInput: ProductionImageInput = {
					editId: input.editId,
					expectedRevision: input.expectedRevision,
					acceptedRevision: input.acceptedRevision,
					shotIds: input.shotIds,
					attempt: input.attempt,
				};
				if (input.newVersion !== undefined) imageInput.newVersion = input.newVersion;
				if (input.model !== undefined) imageInput.model = input.model;
				if (input.strength !== undefined) imageInput.strength = input.strength;
				if (input.references !== undefined) imageInput.references = input.references;
				if (input.styleAnchor !== undefined) imageInput.styleAnchor = input.styleAnchor;
				const imageResult = await runProductionImageCommand(imageInput, context.sdk, undefined, context.signal);
				return { ...imageResult, data: { ...imageResult.data, supported: true } };
			}
			if (input.operation === "production-narration") {
				if (!input.expectedRevision || !input.acceptedRevision || !input.shotIds || input.attempt === undefined || !input.voice) {
					return invalidInput(input, "production-narration requires an expected revision, accepted revision, shot IDs, attempt, and voice.");
				}
				const { runProductionNarrationCommand } = await import("./project-narration-command");
				const narrationInput: ProductionNarrationInput = {
					editId: input.editId,
					expectedRevision: input.expectedRevision,
					acceptedRevision: input.acceptedRevision,
					shotIds: input.shotIds,
					attempt: input.attempt,
					voice: input.voice,
				};
				if (input.newVersion !== undefined) narrationInput.newVersion = input.newVersion;
				// SAFETY: this operation is only reachable through the narration descriptor, whose SDK context includes host narration.
				const narrationResult = await runProductionNarrationCommand(narrationInput, context.sdk as ProductionNarrationSdk, context.resources ?? [], undefined, context.signal);
				return { ...narrationResult, data: { ...narrationResult.data, supported: true } };
			}
			if (!input.expectedRevision || !input.acceptedRevision || !input.shotId || input.shotRevision === undefined || !input.role || !input.idempotencyKey) {
				return invalidInput(input, "production-import requires its revision, shot, role, and idempotency key.");
			}
			const { runProductionImportCommand } = await import("@/media/production-import");
			const importInput: ProductionImportInput = {
				editId: input.editId,
				expectedRevision: input.expectedRevision,
				acceptedRevision: input.acceptedRevision,
				shotId: input.shotId,
				shotRevision: input.shotRevision,
				role: input.role,
				idempotencyKey: input.idempotencyKey,
			};
			if (input.name !== undefined) importInput.name = input.name;
			if (input.durationMs !== undefined) importInput.durationMs = input.durationMs;
			if (input.voiceboxGenerationRef !== undefined) importInput.voiceboxGenerationRef = input.voiceboxGenerationRef;
			if (input.publishedFiles !== undefined) importInput.publishedFiles = input.publishedFiles;
			if (input.sourcePublicId !== undefined) importInput.sourcePublicId = input.sourcePublicId;
			if (input.alignment !== undefined) importInput.alignment = input.alignment;
			const importResult = await runProductionImportCommand(importInput, context.sdk, context.resources ?? []);
			return { ...importResult, data: { ...importResult.data, supported: true } };
		}
		return unavailable(input);
	}

	private async listEdits(): Promise<ProductionCommandResult> {
		const listing = await this.documents.listEdits();
		const current = listing.activeEditId ?? "";
		const fallback = listing.activeEditSource === "most-recent";
		return response({
			supported: true,
			status: "completed",
			operation: "list-edits",
			editId: current,
			message: fallback
				? "Listed edits; editor storage was unavailable, so the most recently updated edit is current."
				: "Listed edits and resolved the editor's current edit.",
			edits: listing.edits,
			activeEditSource: listing.activeEditSource,
			...(listing.activeRevision ? { revision: listing.activeRevision } : {}),
			...(listing.activeLegacyStorageCasRevision ? { legacyStorageCasRevision: listing.activeLegacyStorageCasRevision } : {}),
		});
	}

	private async arrange(input: ProductionCommandInput & { editId: string }): Promise<ProductionCommandResult> {
		if (!input.expectedRevision) return invalidInput(input, "arrange-timeline requires the complete expected edit revision.");
		const snapshot = await new ProductionService(this.documents).load(input.editId);
		if (!snapshot) return editNotFound(input);
		if (!snapshot.accepted) return invalidInput(input, "Accept the production script before arranging its media.");
		const placement = await new ProductionPlacementService(this.documents).run(deriveAcceptedPlacementInput({
			editId: input.editId,
			expectedRevision: input.expectedRevision,
			accepted: snapshot.accepted,
			idempotencyKey: `production-arrange:${input.editId}:${input.expectedRevision.intentRevision}:${input.expectedRevision.digest}`,
		}));
		const data: ProductionCommandData = {
			supported: true,
			status: placement.data.status,
			operation: input.operation,
			editId: input.editId,
			message: placement.data.message,
		};
		if (placement.data.revision) data.revision = placement.data.revision;
		if (placement.data.status === "refused") {
			data.reason = placement.data.reason === "revision-conflict" ? "revision-conflict" : "input-invalid";
		}
		return response(data);
	}

	private async export(
		input: ProductionCommandInput,
	): Promise<ProductionCommandResult> {
		assertEditId(input);
		const current = await this.documents.readCurrent(input.editId);
		if (!current) return editNotFound(input);
		if (current.kind === "legacy") {
			return renameRefusal({
				input,
				current,
				reason: "legacy-revision-required",
				message: "Admit an edit revision before rendering it.",
			});
		}
		if (!input.expectedRevision) {
			return renameRefusal({
				input,
				current,
				reason: "expected-revision-required",
				message: "export-project requires the complete expected edit revision.",
			});
		}
		if (!this.render) return unavailable(input);
		if (!sameRevision(input.expectedRevision, current.document.revision)) {
			return this.revisionConflict(input, current.document);
		}
		const renderInput: ProductionRenderInput = {
			editId: input.editId,
			expectedRevision: input.expectedRevision,
			format: input.format ?? "mp4",
			quality: input.quality ?? "high",
			includeAudio: input.includeAudio ?? true,
		};
		if (input.name !== undefined) renderInput.name = input.name;
		if (input.resolution !== undefined) renderInput.resolution = input.resolution;
		if (input.fps !== undefined) renderInput.fps = input.fps;
		if (input.bitrate !== undefined) renderInput.bitrate = input.bitrate;
		if (input.movCodec !== undefined) renderInput.movCodec = input.movCodec;
		try {
			const rendered = await this.render.run(renderInput);
			return response({
				supported: true,
				status: rendered.status,
				operation: input.operation,
				editId: input.editId,
				message: `Rendered edit ${input.editId}.`,
				revision: rendered.revision,
				operationId: rendered.operationId,
				artifact: rendered.artifact,
			});
		} catch (error) {
			if (!(error instanceof Error) || error.name !== "ProductionRenderOperationError") {
				throw error;
			}
			return response({
				supported: true,
				status: "refused",
				operation: input.operation,
				editId: input.editId,
				message: error.message,
				reason: "render-failed",
				revision: current.document.revision,
			});
		}
	}

	private async inspect(
		input: ProductionCommandInput,
	): Promise<ProductionCommandResult> {
		assertEditId(input);
		const current = await this.documents.readCurrent(input.editId);
		return current ? inspectResult(input, current) : editNotFound(input);
	}

	private async listMedia(
		input: ProductionCommandInput & { editId: string },
	): Promise<ProductionListMediaCommandResult> {
		const current = await this.documents.readCurrent(input.editId);
		if (!current) {
			return {
				kind: "json",
				data: {
					supported: true,
					status: "refused",
					operation: "list-media",
					editId: input.editId,
					message: `Edit ${input.editId} was not found.`,
					reason: "edit-not-found",
					media: [],
				},
			};
		}
		if (current.kind === "legacy") {
			return {
				kind: "json",
				data: {
					supported: true,
					status: "refused",
					operation: "list-media",
					editId: input.editId,
					message: "Admit the edit revision before listing its media.",
					reason: "legacy-revision-required",
					legacyStorageCasRevision: current.storageCasRevision,
					media: [],
				},
			};
		}
		const snapshot = await new ProductionService(this.documents).load(input.editId);
		const accepted = snapshot?.accepted;
		const media = accepted
			? accepted.shots
				.slice(0, MAX_MEDIA_SHOTS)
				.flatMap((shot) => mediaListForShot(shot, snapshot.regenerationCandidates ?? []))
			: [];
		return {
			kind: "json",
			data: {
				supported: true,
				status: "completed",
				operation: "list-media",
				editId: input.editId,
				message: `Listed media for ${Math.min(accepted?.shots.length ?? 0, MAX_MEDIA_SHOTS)} shot${Math.min(accepted?.shots.length ?? 0, MAX_MEDIA_SHOTS) === 1 ? "" : "s"}.`,
				revision: current.document.revision,
				media,
			},
		};
	}

	private async rename(
		input: ProductionCommandInput,
	): Promise<ProductionCommandResult> {
		assertEditId(input);
		const current = await this.documents.readCurrent(input.editId);
		if (!current) return editNotFound(input);
		if (current.kind === "legacy") {
			return renameRefusal({
				input,
				current,
				reason: "legacy-revision-required",
				message: "Open this legacy edit once to admit a revision before renaming it.",
			});
		}
		if (!input.expectedRevision) {
			return renameRefusal({
				input,
				current,
				reason: "expected-revision-required",
				message: "rename-edit requires the complete expected edit revision.",
			});
		}
		const expectedRevision = input.expectedRevision;
		const name = input.name?.trim() ?? "";
		if (name.length === 0 || name.length > MAX_PROJECT_NAME_LENGTH) {
			return renameRefusal({
				input,
				current,
				reason: "input-invalid",
				message: `name must contain between 1 and ${MAX_PROJECT_NAME_LENGTH} characters.`,
			});
		}
		if (expectedRevision.editId !== input.editId) {
			return this.revisionConflict(input, current.document);
		}
		if (sameRevision(expectedRevision, current.document.revision)) {
			return this.commitRename({
				input,
				current: current.document,
				expectedRevision,
				name,
			});
		}
		const replay = await this.readExactRenameReplay({
			current: current.document,
			expectedRevision,
			name,
		});
		if (replay) return this.completedRename(input, replay);
		return this.revisionConflict(input, current.document);
	}

	private async readExactRenameReplay({
		current,
		expectedRevision,
		name,
	}: {
		current: LoadedProductionDocument;
		expectedRevision: EditRevision;
		name: string;
	}): Promise<LoadedProductionDocument | null> {
		if (
			!isImmediateSuccessor(
				current.revision.storageCasRevision,
				expectedRevision.storageCasRevision,
			) ||
			!isImmediateSuccessor(
				current.revision.intentRevision,
				expectedRevision.intentRevision,
			)
		) {
			return null;
		}
		const historical = await this.documents.readRevision({
			editId: expectedRevision.editId,
			intentRevision: expectedRevision.intentRevision,
		});
		if (
			!historical ||
			historical.revision.digest !== expectedRevision.digest ||
			!sameProject(current.project, projectWithName(historical.project, name))
		) {
			return null;
		}
		const verified = await this.documents.readCurrent(expectedRevision.editId);
		return verified?.kind === "document" &&
			sameRevision(verified.document.revision, current.revision) &&
			sameProject(verified.document.project, current.project)
			? verified.document
			: null;
	}

	private revisionConflict(
		input: ProductionCommandInput,
		current: LoadedProductionDocument,
	): ProductionCommandResult {
		assertEditId(input);
		return response({
			supported: true,
			status: "refused",
			operation: input.operation,
			editId: input.editId,
			message: `Edit ${input.editId} changed since the expected revision.`,
			reason: "revision-conflict",
			revision: current.revision,
		});
	}

	private completedRename(
		input: ProductionCommandInput,
		current: LoadedProductionDocument,
	): ProductionCommandResult {
		assertEditId(input);
		return response({
			supported: true,
			status: "completed",
			operation: input.operation,
			editId: input.editId,
			message: `Renamed edit ${input.editId}.`,
			revision: current.revision,
			edit: summarize(current.project),
		});
	}

	private async commitRename({
		input,
		current,
		expectedRevision,
		name,
	}: {
		input: ProductionCommandInput;
		current: LoadedProductionDocument;
		expectedRevision: EditRevision;
		name: string;
	}): Promise<ProductionCommandResult> {
		assertEditId(input);
		const project = projectWithName(current.project, name);
		let saved: LoadedProductionDocument;
		try {
			saved = await this.documents.save({
				editId: input.editId,
				project,
				expectedRevision,
			});
		} catch (error) {
			if (!(error instanceof EditRevisionConflictError)) throw error;
			return response({
				supported: true,
				status: "refused",
				operation: input.operation,
				editId: input.editId,
				message: error.message,
				reason: "revision-conflict",
				revision: error.actual,
			});
		}
		const readback = await this.documents.readCurrent(input.editId);
		if (
			!readback ||
			readback.kind !== "document" ||
			!sameRevision(readback.document.revision, saved.revision) ||
			readback.document.project.metadata.name !== name
		) {
			throw new Error(`Committed edit ${input.editId} could not be read back`);
		}
		return this.completedRename(input, readback.document);
	}
}
