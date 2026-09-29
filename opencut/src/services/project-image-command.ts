import { resolveProjectFolder } from "@/services/storage/project-folder";
import { EditRevisionConflictError, ProductionRevisionSupersededError } from "@/project/production-types";
import { serializeProductionCollection } from "@/project/production-collection";
import type { FilesListEntry, HostApi } from "@ispo/sdk";
import type { FilesStorageApi, EntityStorageApi } from "@/services/storage/sdk-adapter";
import { productionMediaId } from "@/media/production-import";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionService } from "@/project/production-service";
import type {
	ProductionImageCandidate,
	ProductionImageReference,
	ProductionImageReferenceSelection,
	ProductionPendingJob,
	ProductionStyleAnchor,
	ProductionStyleAnchorInput,
} from "@/project/production-types";
import { ProductionInputError } from "@/project/production-types";
import type {
	ProductionImageInput,
	ProductionImageModelPin,
	ProductionMediaCommandResult,
} from "./project-command-types";
import type { ProductionImageAspectRatio } from "@/project/production-types";
import { CLOUD_JOB_TIMEOUT_MESSAGE, CLOUD_JOB_UNAVAILABLE_MESSAGE, cloudJobPendingMessage, cloudJobPendingRef, cloudJobTerminalMessage, inlineCloudJobPollOptions, isCloudJobPendingError, isCloudJobPendingPoll, isCloudJobTerminalPoll, isCloudJobTransportTimeout, isCloudJobUnavailableError, isCloudJobUnavailablePoll, pollCloudJob, type CloudJobPendingPoll, type CloudJobPollOptions, type CloudJobSucceeded } from "./cloud-job-poll";
import { collectCloudFile } from "./cloud-job-files";

const SUPPORTED_ASPECT_RATIOS: readonly ProductionImageAspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"];
const ASPECT_RATIO_VALUES = {
	"1:1": 1,
	"16:9": 16 / 9,
	"9:16": 9 / 16,
	"4:3": 4 / 3,
	"3:4": 3 / 4,
	"21:9": 21 / 9,
} as const satisfies Record<ProductionImageAspectRatio, number>;
const ASPECT_RATIO_TOLERANCE = 0.05;

export function deriveProductionImageAspectRatio(canvas: { width: number; height: number }): ProductionImageAspectRatio {
	const ratio = canvas.width / canvas.height;
	return SUPPORTED_ASPECT_RATIOS.reduce((nearest, candidate) => {
		const distance = Math.abs(Math.log(ratio / ASPECT_RATIO_VALUES[candidate]));
		const nearestDistance = Math.abs(Math.log(ratio / ASPECT_RATIO_VALUES[nearest]));
		return distance < nearestDistance ? candidate : nearest;
	}, SUPPORTED_ASPECT_RATIOS[0]);
}

export function aspectRatioMatchesDimensions(
	dimensions: { width: number; height: number },
	aspectRatio: ProductionImageAspectRatio,
): boolean {
	if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) return false;
	return Math.abs(Math.log((dimensions.width / dimensions.height) / ASPECT_RATIO_VALUES[aspectRatio])) <= ASPECT_RATIO_TOLERANCE;
}

function sameReference(left: ProductionImageInput["acceptedRevision"], right: ProductionImageInput["acceptedRevision"]): boolean {
	return left.editId === right.editId &&
		left.documentIntentRevision === right.documentIntentRevision &&
		left.productionRevisionId === right.productionRevisionId &&
		left.contentDigest === right.contentDigest;
}

function sameEditRevision(left: ProductionImageInput["expectedRevision"], right: ProductionImageInput["expectedRevision"]): boolean {
	return left.editId === right.editId &&
		left.intentRevision === right.intentRevision &&
		left.digest === right.digest;
}

function sameModel(left: ProductionImageInput["model"], right: ProductionImageInput["model"]): boolean {
	return left?.modelKey === right?.modelKey && left?.modelVersion === right?.modelVersion;
}

export interface ProductionImageSdk {
	entities: EntityStorageApi;
	files: FilesStorageApi;
	host: {
		storyboardImage: {
			generate(input: {
				prompt: string;
				format: "png" | "jpeg" | "webp";
				aspectRatio: ProductionImageAspectRatio;
				width?: number;
				height?: number;
				filesDestination: { folder: string; name: string };
				idempotencyKey: string;
				model?: ProductionImageModelPin;
				referencePublicIds?: string[];
				strength?: number;
				timeoutMs?: number;
			}): Promise<{
				resource: ProductionImageCandidate["resource"];
				aspectRatio?: ProductionImageAspectRatio;
				model?: ProductionImageModelPin;
			}>;
		};
		cloudJobs?: Pick<HostApi["cloudJobs"], "get">;
	};
	pendingJobPoll?: CloudJobPollOptions;
}

type StoryboardImageResponse = Awaited<ReturnType<ProductionImageSdk["host"]["storyboardImage"]["generate"]>>;

function isImageMimeType(value: string): value is "image/png" | "image/jpeg" | "image/webp" {
	return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

async function settledImageResponse(
	job: CloudJobSucceeded,
	sdk: ProductionImageSdk,
	aspectRatio: ProductionImageAspectRatio,
): Promise<StoryboardImageResponse> {
	const collected = await collectCloudFile(job, sdk.files.list, "image", "image/png");
	const { cloud: artifact, file: resource, published } = collected;
	if (!isImageMimeType(resource.mimeType) || !artifact.dimensions) throw new Error("Cloud image job succeeded without image dimensions.");
	return {
		resource: {
			kind: "files",
			publicId: published.publicId,
			path: published.path,
			digest: resource.digest,
			byteLength: resource.byteLength,
			mimeType: resource.mimeType,
			dimensions: structuredClone(artifact.dimensions),
		},
		aspectRatio,
		model: { modelKey: job.model.modelKey, modelVersion: job.model.modelVersion },
	};
}

async function pollPendingImageJob(
	jobRef: string,
	sdk: ProductionImageSdk,
	aspectRatio: ProductionImageAspectRatio,
	signal?: AbortSignal,
): Promise<StoryboardImageResponse | { terminalMessage: string } | { unavailable: true } | CloudJobPendingPoll | null> {
	if (!sdk.host.cloudJobs) return null;
	const result = await pollCloudJob(jobRef, sdk.host.cloudJobs.get, { ...inlineCloudJobPollOptions(sdk.pendingJobPoll), ...(signal ? { signal } : {}) });
	if (result.kind === "succeeded") return settledImageResponse(result.job, sdk, aspectRatio);
	if (result.kind === "terminal") return { terminalMessage: cloudJobTerminalMessage(result.job) };
	if (result.kind === "unavailable") return { unavailable: true };
	if (result.kind === "pending") return { pending: true, ...(result.lastState ? { state: result.lastState } : {}) };
	return null;
}

async function addGeneratedImageToMediaLibrary(
	candidate: ProductionImageCandidate,
	input: ProductionImageInput,
	mediaLibrary: ProductionMediaLibrary,
	sdk: ProductionImageSdk,
): Promise<void> {
	const published = (await sdk.files.list()).find((entry) => entry.publicId === candidate.resource.publicId);
	if (!published?.url) throw new Error("Generated image is not readable from Files.");
	const response = await fetch(published.url);
	if (!response.ok) throw new Error(`Files returned ${response.status} for generated image.`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
	if (digest !== candidate.resource.digest) throw new Error("Generated image digest does not match its Files artifact.");
	const file = new File([bytes], published.name, { type: candidate.resource.mimeType });
	await mediaLibrary.import({
		editId: input.editId,
		mediaId: candidate.mediaId ?? await productionMediaId({ editId: input.editId, acceptedRevision: input.acceptedRevision, shotId: candidate.shotId, role: "visual" }, candidate.resource.digest),
		mediaRevision: candidate.version?.mediaRevision ?? candidate.resource.digest,
		role: "visual",
		name: published.name,
		mimeType: candidate.resource.mimeType,
		digest: candidate.resource.digest,
		file,
		width: candidate.resource.dimensions.width,
		height: candidate.resource.dimensions.height,
	});
}

type ProductionMediaRefusal = NonNullable<ProductionMediaCommandResult["data"]["reason"]>;

function result(
	input: ProductionImageInput,
	data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "supported">,
): ProductionMediaCommandResult {
	return {
		kind: "json",
		data: { ...data, supported: true, operation: "production-image", editId: input.editId },
	};
}

function refusal(
	input: ProductionImageInput,
	reason: ProductionMediaRefusal,
	message: string,
): ProductionMediaCommandResult {
	return result(input, { status: "refused", reason, message });
}

function safeProducerFailureMessage(error: unknown): string {
	const name = error instanceof Error ? error.name : "UnknownError";
	const message = error instanceof Error ? error.message : String(error);
	const safe = (value: string): string => value
		.replace(/^Error invoking remote method '[^']+':\s*/i, "")
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 512);
	return `Storyboard image collection failed: ${safe(name) || "UnknownError"}: ${safe(message) || "Unknown producer error."}`;
}

function pending(input: ProductionImageInput, message: string, revision?: ProductionMediaCommandResult["data"]["revision"]): ProductionMediaCommandResult {
	const data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "supported"> = { status: "pending", message };
	if (revision) data.revision = revision;
	return result(input, data);
}

function pendingJob(input: ProductionImageInput, shot: { shotId: string; revision: number; visualBrief: string }, idempotencyKey: string, jobRef: string): ProductionPendingJob {
	const job: ProductionPendingJob = {
		role: "visual",
		jobRef,
		idempotencyKey,
		acceptedRevision: structuredClone(input.acceptedRevision),
		shotId: shot.shotId,
		shotRevision: shot.revision,
		pendingSince: Date.now(),
		visualBrief: input.visualBrief ?? shot.visualBrief,
	};
	if (input.model) job.model = structuredClone(input.model);
	return job;
}

export function selectImagePendingJob(
	jobs: readonly ProductionPendingJob[] | undefined,
	shot: { shotId: string; revision: number },
	reference: ProductionImageInput["acceptedRevision"],
	model: ProductionImageInput["model"],
): ProductionPendingJob | undefined {
	return jobs?.filter((job) => ((job.status ?? "pending") === "pending" || job.status === "failed") && job.role === "visual" && job.shotId === shot.shotId && job.shotRevision === shot.revision && sameReference(job.acceptedRevision, reference) && (job.status === "failed" ? sameModel(job.model, model) : true) && Boolean(job.jobRef)).map((job, index) => ({ job, index })).sort((leftEntry, rightEntry) => {
		const left = leftEntry.job;
		const right = rightEntry.job;
		const leftActive = (left.status ?? "pending") === "pending";
		const rightActive = (right.status ?? "pending") === "pending";
		if (leftActive !== rightActive) return leftActive ? -1 : 1;
		const leftTime = pendingJobTime(left.pendingSince);
		const rightTime = pendingJobTime(right.pendingSince);
		if (leftTime === undefined || rightTime === undefined) return rightEntry.index - leftEntry.index;
		return rightTime - leftTime;
	})[0]?.job;
}

function pendingJobTime(value: ProductionPendingJob["pendingSince"]): number | undefined {
	if (value === undefined) return undefined;
	const numeric = Number(value);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(String(value));
	return Number.isFinite(parsed) ? parsed : undefined;
}

function addPendingImageDetails(
	job: ProductionPendingJob,
	prompt: string,
	references: ProductionImageReference[],
	styleAnchorRevision: string | undefined,
	strength: number | undefined,
): ProductionPendingJob {
	job.prompt = prompt;
	job.references = structuredClone(references);
	if (styleAnchorRevision !== undefined) job.styleAnchorRevision = styleAnchorRevision;
	if (strength !== undefined) job.strength = strength;
	return job;
}

export function validResource(
	resource: Omit<ProductionImageCandidate["resource"], "dimensions"> & { dimensions?: ProductionImageCandidate["resource"]["dimensions"] },
	aspectRatio: ProductionImageAspectRatio,
): boolean {
	return resource.kind === "files" &&
		resource.byteLength > 0 &&
		resource.dimensions !== undefined &&
		aspectRatioMatchesDimensions(resource.dimensions, aspectRatio);
}

const MAX_REFERENCES = 4;
const MAX_REFERENCE_NAME_LENGTH = 256;

function referenceFromFile(file: FilesListEntry): ProductionImageReference {
	const name = file.name.trim().slice(0, MAX_REFERENCE_NAME_LENGTH) || file.publicId;
	return { publicId: file.publicId, name };
}

function referenceFromVersion(version: { mediaId: string; name: string; filesRef?: { publicId: string } }): ProductionImageReference {
	return { publicId: version.filesRef?.publicId ?? version.mediaId, name: version.name };
}

function validateReferenceCount(references: ProductionImageReference[]): void {
	if (references.length < 1 || references.length > MAX_REFERENCES) {
		throw new ProductionInputError(`Choose between 1 and ${MAX_REFERENCES} reference images`);
	}
	if (new Set(references.map((reference) => reference.publicId)).size !== references.length) {
		throw new ProductionInputError("Reference images must be unique");
	}
}

async function anchorFromInput(input: ProductionStyleAnchorInput, files: readonly FilesListEntry[]): Promise<ProductionStyleAnchor> {
	if (input.styleSentence.trim().length === 0 || input.styleSentence.length > 2_000) throw new ProductionInputError("The style anchor sentence is invalid");
	if (input.referencePublicIds.length < 1 || input.referencePublicIds.length > MAX_REFERENCES) throw new ProductionInputError("The style anchor needs between 1 and 4 reference images");
	const byId = new Map(files.map((file) => [file.publicId, file]));
	const references = input.referencePublicIds.map((publicId) => {
		const file = byId.get(publicId);
		if (!file || !file.mimeType.startsWith("image/")) throw new ProductionInputError(`Reference image ${publicId} is not in this project's Files`);
		return referenceFromFile(file);
	});
	validateReferenceCount(references);
	const bytes = new TextEncoder().encode(JSON.stringify({ styleSentence: input.styleSentence, references }));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return { revision: `style-anchor-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32)}`, styleSentence: input.styleSentence, references };
}

async function resolveReferences({
	input,
	shotId,
	acceptedShots,
	styleAnchor,
	files,
}: {
	input: ProductionImageInput;
	shotId: string;
	acceptedShots: Array<{ shotId: string; imageVersion?: { mediaId: string; name: string; filesRef?: { publicId: string } } }>;
	styleAnchor?: ProductionStyleAnchor;
	files: readonly FilesListEntry[];
}): Promise<ProductionImageReference[]> {
	const selection: ProductionImageReferenceSelection | undefined = input.references;
	if (!selection) return styleAnchor?.references ? structuredClone(styleAnchor.references) : [];
	if (selection.mode === "explicit") {
		const byId = new Map(files.map((file) => [file.publicId, file]));
		const references = selection.publicIds.map((publicId) => {
			const file = byId.get(publicId);
			if (!file || !file.mimeType.startsWith("image/")) throw new ProductionInputError(`Reference image ${publicId} is not in this project's Files`);
			return referenceFromFile(file);
		});
		validateReferenceCount(references);
		return references;
	}
	if (selection.mode === "random" && selection.pool === "files-folder" && (!selection.folder || selection.folder.trim().length === 0)) {
		throw new ProductionInputError("A Files folder is required for a random Files pool");
	}
	const pool = selection.mode === "previous"
		? acceptedShots.slice(0, acceptedShots.findIndex((shot) => shot.shotId === shotId)).flatMap((shot) => shot.imageVersion ? [referenceFromVersion(shot.imageVersion)] : [])
		: selection.pool === "style-anchor"
			? styleAnchor?.references ?? []
			: selection.pool === "accepted"
				? acceptedShots.flatMap((shot) => shot.imageVersion ? [referenceFromVersion(shot.imageVersion)] : [])
				: files.filter((file) => file.folder === selection.folder && file.mimeType.startsWith("image/")).map(referenceFromFile);
	if (pool.length === 0) throw new ProductionInputError("The selected reference pool is empty");
	const count = selection.mode === "previous" ? Math.min(selection.count ?? MAX_REFERENCES, MAX_REFERENCES) : selection.count;
	if (!Number.isSafeInteger(count) || count < 1 || count > MAX_REFERENCES) throw new ProductionInputError("Reference count must be between 1 and 4");
	const uniquePool = [...new Map(pool.map((reference) => [reference.publicId, reference])).values()];
	if (selection.mode !== "previous" && uniquePool.length < count) throw new ProductionInputError("The selected reference pool has fewer images than requested");
	const scored = await Promise.all(uniquePool.map(async (reference) => {
		const bytes = new TextEncoder().encode(`${input.editId}\0${shotId}\0${input.newVersion ? input.attempt : "retry"}\0${reference.publicId}`);
		const digest = await crypto.subtle.digest("SHA-256", bytes);
		return { reference, score: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") };
	}));
	const selected = selection.mode === "previous"
		? uniquePool.slice(0, count)
		: scored.sort((left, right) => left.score.localeCompare(right.score)).slice(0, count).map((item) => item.reference);
	validateReferenceCount(selected);
	return selected;
}

async function operationKey(input: ProductionImageInput, shotId: string, prompt: string, references: ProductionImageReference[], styleAnchorRevision?: string): Promise<string> {
	const value = JSON.stringify({ editId: input.editId, productionRevisionId: input.acceptedRevision.productionRevisionId, shotId, version: input.newVersion ? input.attempt : undefined, model: input.model, strength: input.strength, prompt, references: references.map(({ publicId }) => publicId), styleAnchorRevision });
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return `production-image-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 56)}`;
}

export async function runProductionImageCommand(
	input: ProductionImageInput,
	sdk: ProductionImageSdk,
	mediaLibrary?: ProductionMediaLibrary,
	signal?: AbortSignal,
): Promise<ProductionMediaCommandResult> {
	return serializeProductionCollection(input.editId, () => runProductionImageCommandOwned(input, sdk, mediaLibrary, signal), signal);
}

async function runProductionImageCommandOwned(
	input: ProductionImageInput,
	sdk: ProductionImageSdk,
	mediaLibrary?: ProductionMediaLibrary,
	signal?: AbortSignal,
): Promise<ProductionMediaCommandResult> {
	if (!sdk.host?.storyboardImage?.generate) {
		return refusal(input, "capability-unavailable", "Storyboard image generation is not available.");
	}
	if (input.shotIds.length === 0 || input.shotIds.length > 100 || input.attempt < 1 || !Number.isSafeInteger(input.attempt) || (input.strength !== undefined && (!Number.isFinite(input.strength) || input.strength < 0 || input.strength > 1))) {
		return refusal(input, "input-invalid", "shotIds and attempt must be bounded.");
	}
	const documents = new ProductionDocumentService(sdk);
	const service = new ProductionService(documents);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") {
		return refusal(input, "legacy-revision-required", "Admit an edit revision before generating images.");
	}
	if (current.document.revision.editId !== input.editId ||
		!sameEditRevision(current.document.revision, input.expectedRevision)) {
		return refusal(input, "revision-conflict", "The edit changed since the expected revision.");
	}
	const productionSnapshot = await service.load(input.editId);
	const accepted = productionSnapshot?.accepted;
	if (!accepted || !sameReference(accepted.reference, input.acceptedRevision)) return refusal(input, "accepted-source-mismatch", "The accepted production revision is no longer current.");
	const uniqueShotIds = [...new Set(input.shotIds)];
	const shots = uniqueShotIds.map((shotId) => accepted.shots.find((shot) => shot.shotId === shotId));
	if (shots.some((shot) => !shot)) return refusal(input, "accepted-source-mismatch", "Every requested shot must be accepted.");
	const acceptedShots = shots.filter((shot): shot is NonNullable<(typeof shots)[number]> => shot !== undefined);
	try {
		const aspectRatio = deriveProductionImageAspectRatio(accepted.canvas);
		const needsFiles = Boolean(input.styleAnchor) || input.references?.mode === "explicit" || (input.references?.mode === "random" && input.references.pool === "files-folder");
		const files = needsFiles ? await sdk.files.list() : [];
		const styleAnchor = input.styleAnchor ? await anchorFromInput(input.styleAnchor, files) : productionSnapshot?.styleAnchor;
		const generated: ProductionImageCandidate[] = [];
		const resumedPendingJobs: ProductionPendingJob[] = [];
		let hasPendingJobs = false;
		let awaitingConsent = false;
		let revision = input.expectedRevision;
		for (const shot of acceptedShots) {
			const existingPending = input.newVersion ? undefined : selectImagePendingJob(accepted.pendingJobs, shot, accepted.reference, input.model);
			const failedPending = input.newVersion ? undefined : accepted.pendingJobs?.find((job) => job.status === "failed" && job.role === "visual" && job.shotId === shot.shotId && job.shotRevision === shot.revision && sameReference(job.acceptedRevision, accepted.reference) && sameModel(job.model, input.model) && !job.jobRef);
			if (failedPending && !existingPending) return refusal(input, failedPending.failureReason ?? "producer-failed", failedPending.failureMessage ?? CLOUD_JOB_UNAVAILABLE_MESSAGE);
			const references = existingPending?.references ? structuredClone(existingPending.references) : await resolveReferences({ input, shotId: shot.shotId, acceptedShots: accepted.shots, styleAnchor, files });
			const prompt = existingPending?.prompt ?? [styleAnchor?.styleSentence, input.visualBrief ?? shot.visualBrief].filter(Boolean).join("\n\n");
			const idempotencyKey = existingPending?.idempotencyKey ?? await operationKey(input, shot.shotId, prompt, references, styleAnchor?.revision);
			const existing = existingPending ? undefined : shot.imageCandidates?.find((candidate) => candidate.idempotencyKey === idempotencyKey);
			if (existing) {
				generated.push(existing);
				continue;
			}
			const generateInput: Parameters<ProductionImageSdk["host"]["storyboardImage"]["generate"]>[0] = {
				prompt,
				format: "png",
				aspectRatio,
				width: accepted.canvas.width,
				height: accepted.canvas.height,
				filesDestination: {
					folder: await resolveProjectFolder({ editId: input.editId, section: "Storyboards" }),
					name: `${shot.shotId}-${input.attempt}.png`,
				},
				idempotencyKey,
				...(input.model ? { model: input.model } : {}),
				...(references.length > 0 ? { referencePublicIds: references.map((reference) => reference.publicId) } : {}),
				...(input.strength !== undefined ? { strength: input.strength } : {}),
				timeoutMs: 30_000,
			};
			let response: StoryboardImageResponse;
			if (existingPending) {
				const settled = await pollPendingImageJob(existingPending.jobRef, sdk, aspectRatio, signal);
				if (!settled || isCloudJobPendingPoll(settled)) {
					hasPendingJobs = true;
					awaitingConsent ||= Boolean(settled && isCloudJobPendingPoll(settled) && settled.state === "awaiting-consent");
					continue;
				}
				if (isCloudJobUnavailablePoll(settled)) {
					const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: input.expectedRevision, idempotencyKey: existingPending.idempotencyKey });
					return result(input, { status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: cleared.documentRevision });
				}
				if (isCloudJobTerminalPoll(settled)) {
					const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: input.expectedRevision, idempotencyKey: existingPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
					return result(input, { status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: failed.documentRevision });
				}
				resumedPendingJobs.push(existingPending);
				response = settled;
			} else {
				try {
					response = await sdk.host.storyboardImage.generate(generateInput);
				} catch (error) {
						if (error instanceof Error && isCloudJobTransportTimeout(error)) {
						try {
							response = await sdk.host.storyboardImage.generate(generateInput);
						} catch (retryError) {
							if (!isCloudJobPendingError(retryError)) throw retryError;
							const jobRef = cloudJobPendingRef(retryError);
							if (!jobRef) throw retryError;
							const recoveredPending = pendingJob(input, shot, idempotencyKey, jobRef);
							addPendingImageDetails(recoveredPending, prompt, references, styleAnchor?.revision, input.strength);
							const savedPending = await service.recordPendingJob({ reference: accepted.reference, expectedRevision: revision, pendingJob: recoveredPending });
							revision = savedPending.documentRevision;
							const settled = await pollPendingImageJob(jobRef, sdk, aspectRatio, signal);
							if (!settled || isCloudJobPendingPoll(settled)) {
								hasPendingJobs = true;
					awaitingConsent ||= Boolean(settled && isCloudJobPendingPoll(settled) && settled.state === "awaiting-consent");
								continue;
							}
							if (isCloudJobUnavailablePoll(settled)) {
								const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey });
								return result(input, { status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: cleared.documentRevision });
							}
							if (isCloudJobTerminalPoll(settled)) {
								const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
								return result(input, { status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: failed.documentRevision });
							}
							resumedPendingJobs.push(recoveredPending);
							response = settled;
						}
					} else {
						if (!isCloudJobPendingError(error)) throw error;
						const jobRef = cloudJobPendingRef(error);
						if (!jobRef) throw error;
						const pendingRecord = pendingJob(input, shot, idempotencyKey, jobRef);
						addPendingImageDetails(pendingRecord, prompt, references, styleAnchor?.revision, input.strength);
						const savedPending = await service.recordPendingJob({ reference: accepted.reference, expectedRevision: revision, pendingJob: pendingRecord });
						revision = savedPending.documentRevision;
						const settled = await pollPendingImageJob(jobRef, sdk, aspectRatio, signal);
						if (!settled || isCloudJobPendingPoll(settled)) {
							hasPendingJobs = true;
					awaitingConsent ||= Boolean(settled && isCloudJobPendingPoll(settled) && settled.state === "awaiting-consent");
							continue;
						}
						if (isCloudJobUnavailablePoll(settled)) {
							const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: pendingRecord.idempotencyKey });
							return result(input, { status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: cleared.documentRevision });
						}
						if (isCloudJobTerminalPoll(settled)) {
							const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: pendingRecord.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
							return result(input, { status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: failed.documentRevision });
						}
						response = settled;
					}
				}
			}
			const resultAspectRatio = response.aspectRatio ?? aspectRatio;
			if (resultAspectRatio !== aspectRatio || !validResource(response.resource, resultAspectRatio)) {
				throw new Error("Storyboard image producer returned an invalid Files resource");
			}
			const mediaId = await productionMediaId({ editId: input.editId, acceptedRevision: input.acceptedRevision, shotId: shot.shotId, role: "visual" }, response.resource.digest);
			const candidate: ProductionImageCandidate = {
				kind: "storyboard-image" as const,
				idempotencyKey,
				candidateId: idempotencyKey,
				mediaId,
				version: { mediaRevision: response.resource.digest },
				visualBrief: input.visualBrief ?? shot.visualBrief,
				prompt,
				...(input.strength !== undefined ? { strength: input.strength } : {}),
				...(references.length > 0 ? { references: structuredClone(references) } : {}),
				...(styleAnchor ? { styleAnchorRevision: styleAnchor.revision } : {}),
				aspectRatio: resultAspectRatio,
				dimensions: structuredClone(response.resource.dimensions),
				acceptedRevision: structuredClone(accepted.reference),
				shotId: shot.shotId,
				shotRevision: shot.revision,
				resource: response.resource,
			};
			const selectedModel = response.model ?? input.model;
			if (selectedModel) candidate.model = structuredClone(selectedModel);
			if (mediaLibrary) await addGeneratedImageToMediaLibrary(candidate, input, mediaLibrary, sdk);
			generated.push(candidate);
		}
		let finalRevision = revision;
		if (generated.length > 0) {
			const saved = await service.recordImageCandidates({
				reference: accepted.reference,
				expectedRevision: revision,
				candidates: generated,
				...(styleAnchor ? { styleAnchor } : {}),
			});
			finalRevision = saved.documentRevision;
		}
		for (const resumedPendingJob of resumedPendingJobs) {
			finalRevision = (await service.clearPendingJob({ reference: accepted.reference, expectedRevision: finalRevision, idempotencyKey: resumedPendingJob.idempotencyKey })).documentRevision;
		}
		if (hasPendingJobs) return pending(input, cloudJobPendingMessage("Storyboard image", awaitingConsent ? "awaiting-consent" : undefined), finalRevision);
		return result(input, {
			status: "completed",
			message: `Generated ${generated.length} storyboard image${generated.length === 1 ? "" : "s"}.`,
			revision: finalRevision,
			shots: generated.map((candidate) => ({
				shotId: candidate.shotId,
				publicId: candidate.resource.publicId,
				path: candidate.resource.path,
				digest: candidate.resource.digest,
				...(candidate.references ? { references: candidate.references.map(({ name }) => ({ name })) } : {}),
				...(candidate.styleAnchorRevision ? { styleAnchorRevision: candidate.styleAnchorRevision } : {}),
			})),
		});
	} catch (error) {
		if (error instanceof EditRevisionConflictError || error instanceof ProductionRevisionSupersededError) return refusal(input, "revision-conflict", "The edit changed while collecting media. Refresh the edit and collect the same job; do not generate another version.");
		if (error instanceof Error && isCloudJobTransportTimeout(error)) return refusal(input, "producer-timeout", CLOUD_JOB_TIMEOUT_MESSAGE);
		if (isCloudJobPendingError(error)) {
			return pending(input, cloudJobPendingMessage("Storyboard image"));
		}
		if (isCloudJobUnavailableError(error)) return refusal(input, "producer-failed", CLOUD_JOB_UNAVAILABLE_MESSAGE);
		if (error instanceof Error && error.name === "ProductionInputError") {
			return refusal(input, "input-invalid", error.message);
		}
		return refusal(
			input,
			error instanceof Error && /authority|denied|grant|permission/i.test(error.message) ? "capability-unavailable" : "producer-failed",
			error instanceof Error && /authority|denied|grant|permission/i.test(error.message) ? "The host did not grant access to storyboard image generation." : safeProducerFailureMessage(error),
		);
	}
}
