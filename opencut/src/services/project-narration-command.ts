import { resolveProjectFolder } from "@/services/storage/project-folder";
import { EditRevisionConflictError, ProductionRevisionSupersededError } from "@/project/production-types";
import { serializeProductionCollection } from "@/project/production-collection";
import type { CommandResourceDelivery, HostApi, HostNarrationApi } from "@ispo/sdk";
import type {
	ProductionImportCommandResult,
	ProductionMediaCommandResult,
	ProductionNarrationInput,
	ProductionNarrationVoice,
} from "./project-command-types";
import { ProductionDocumentService } from "@/project/production-document-service";
import { ProductionService } from "@/project/production-service";
import { runProductionImportCommand } from "@/media/production-import";
import type { ProductionImportSdk } from "@/media/production-import";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import type { ProductionPendingJob } from "@/project/production-types";
import { CLOUD_JOB_TIMEOUT_MESSAGE, CLOUD_JOB_UNAVAILABLE_MESSAGE, cloudJobPendingMessage, cloudJobPendingRef, cloudJobProducerFailureMessage, cloudJobTerminalMessage, inlineCloudJobPollOptions, isCloudJobPendingError, isCloudJobPendingPoll, isCloudJobTerminalPoll, isCloudJobTransportTimeout, isCloudJobUnavailableError, isCloudJobUnavailablePoll, pollCloudJob, type CloudJobPendingPoll, type CloudJobPollOptions, type CloudJobSucceeded } from "./cloud-job-poll";
import { collectCloudFile } from "./cloud-job-files";

const VOICES: readonly ProductionNarrationVoice[] = [
	"neutral",
	"warm",
	"authoritative",
	"conversational",
];

export interface ProductionNarrationSdk extends ProductionImportSdk {
	host: {
		narration: HostNarrationApi;
		cloudJobs?: Pick<HostApi["cloudJobs"], "get">;
	};
	pendingJobPoll?: CloudJobPollOptions;
}

type ProductionMediaRefusal = NonNullable<ProductionMediaCommandResult["data"]["reason"]>;

type NarrationResponse = Awaited<ReturnType<ProductionNarrationSdk["host"]["narration"]["generate"]>>;

function isAlignment(value: unknown): value is NonNullable<NarrationResponse["alignment"]> {
	if (!value || typeof value !== "object" || !Array.isArray((value as { words?: unknown }).words)) return false;
	return (value as { words: unknown[] }).words.every((word) => {
		if (!word || typeof word !== "object") return false;
		const candidate = word as { word?: unknown; startMs?: unknown; endMs?: unknown };
		return typeof candidate.word === "string" && candidate.word.length > 0 && typeof candidate.startMs === "number" && Number.isFinite(candidate.startMs) && candidate.startMs >= 0 && typeof candidate.endMs === "number" && Number.isFinite(candidate.endMs) && candidate.endMs >= 0;
	});
}

function alignmentFromJob(job: CloudJobSucceeded): NarrationResponse["alignment"] {
	if (!job.output || typeof job.output !== "object") return undefined;
	const alignment = (job.output as { alignment?: unknown }).alignment;
	return isAlignment(alignment) ? structuredClone(alignment) : undefined;
}

async function settledNarrationResponse(
	job: CloudJobSucceeded,
	sdk: ProductionNarrationSdk,
	input: ProductionNarrationInput,
	text: string,
): Promise<NarrationResponse> {
	const collected = await collectCloudFile(job, sdk.files.list, "audio", "audio/wav");
	const { file: resource, published } = collected;
	return {
		resource: { kind: "files", publicId: published.publicId, path: published.path, digest: resource.digest, byteLength: resource.byteLength, mimeType: "audio/wav" },
		text,
		voice: input.voice,
		model: { modelKey: job.model.modelKey, modelVersion: job.model.modelVersion },
		...(alignmentFromJob(job) ? { alignment: alignmentFromJob(job) } : {}),
	};
}

async function pollPendingNarrationJob(
	jobRef: string,
	sdk: ProductionNarrationSdk,
	input: ProductionNarrationInput,
	text: string,
	signal?: AbortSignal,
): Promise<NarrationResponse | { terminalMessage: string } | { unavailable: true } | CloudJobPendingPoll | null> {
	if (!sdk.host.cloudJobs) return null;
	const result = await pollCloudJob(jobRef, sdk.host.cloudJobs.get, { ...inlineCloudJobPollOptions(sdk.pendingJobPoll), ...(signal ? { signal } : {}) });
	if (result.kind === "succeeded") return settledNarrationResponse(result.job, sdk, input, text);
	if (result.kind === "terminal") return { terminalMessage: cloudJobTerminalMessage(result.job) };
	if (result.kind === "unavailable") return { unavailable: true };
	if (result.kind === "pending") return { pending: true, ...(result.lastState ? { state: result.lastState } : {}) };
	return null;
}

function sameReference(
	left: ProductionNarrationInput["acceptedRevision"],
	right: ProductionNarrationInput["acceptedRevision"],
): boolean {
	return left.editId === right.editId &&
		left.documentIntentRevision === right.documentIntentRevision &&
		left.productionRevisionId === right.productionRevisionId &&
		left.contentDigest === right.contentDigest;
}

function sameEditRevision(
	left: ProductionNarrationInput["expectedRevision"],
	right: ProductionNarrationInput["expectedRevision"],
): boolean {
	return left.editId === right.editId &&
		left.intentRevision === right.intentRevision &&
		left.digest === right.digest;
}

async function operationKey(
	input: ProductionNarrationInput,
	shotId: string,
): Promise<string> {
	const value = `${input.editId}\0${input.acceptedRevision.productionRevisionId}\0${shotId}\0${input.newVersion ? input.attempt : "retry"}\0${input.voice}`;
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return `production-narration-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48)}`;
}

function result(
	input: ProductionNarrationInput,
	data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "supported">,
): ProductionMediaCommandResult {
	return {
		kind: "json",
		data: {
			...data,
			supported: true,
			operation: "production-narration",
			editId: input.editId,
		},
	};
}

function refusal(
	input: ProductionNarrationInput,
	reason: ProductionMediaRefusal,
	message: string,
): ProductionMediaCommandResult {
	return result(input, { status: "refused", reason, message });
}

function pending(input: ProductionNarrationInput, message: string, revision?: ProductionMediaCommandResult["data"]["revision"]): ProductionMediaCommandResult {
	const data: Omit<ProductionMediaCommandResult["data"], "operation" | "editId" | "supported"> = { status: "pending", message };
	if (revision) data.revision = revision;
	return result(input, data);
}

function pendingJob(input: ProductionNarrationInput, shot: { shotId: string; revision: number }, idempotencyKey: string, jobRef: string): ProductionPendingJob {
	return {
		role: "narration",
		jobRef,
		idempotencyKey,
		acceptedRevision: structuredClone(input.acceptedRevision),
		shotId: shot.shotId,
		shotRevision: shot.revision,
		voice: input.voice,
		pendingSince: Date.now(),
	};
}

export function selectNarrationPendingJob(
	jobs: readonly ProductionPendingJob[] | undefined,
	shot: { shotId: string; revision: number },
	reference: ProductionNarrationInput["acceptedRevision"],
	voice: ProductionNarrationVoice,
): ProductionPendingJob | undefined {
	return jobs?.filter((job) => ((job.status ?? "pending") === "pending" || job.status === "failed") && job.role === "narration" && job.shotId === shot.shotId && job.shotRevision === shot.revision && job.voice === voice && sameReference(job.acceptedRevision, reference) && Boolean(job.jobRef)).map((job, index) => ({ job, index })).sort((leftEntry, rightEntry) => {
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

function voiceIsCurated(voice: string): voice is ProductionNarrationVoice {
	// SAFETY: this assertion is guarded by membership in the closed curated voice tuple.
	return VOICES.includes(voice as ProductionNarrationVoice);
}

function importResult(
	input: ProductionNarrationInput,
	value: ProductionImportCommandResult | ProductionMediaCommandResult,
): ProductionMediaCommandResult {
	if (value.data.operation !== "production-import" || value.data.status !== "completed" || !value.data.media || !value.data.filesRef) {
		return refusal(input, value.data.reason ?? "producer-failed", value.data.message);
	}
	return result(input, {
		status: "completed",
		message: `Generated and imported narration for ${value.data.media.shotId}.`,
		revision: value.data.revision,
		shots: [{
			shotId: value.data.media.shotId,
			publicId: value.data.filesRef.publicId,
			path: value.data.filesRef.path ?? "",
			digest: value.data.media.mediaRevision,
			mediaId: value.data.media.mediaId,
			mediaRevision: value.data.media.mediaRevision,
			durationMs: value.data.media.durationMs,
		}],
	});
}

export async function runProductionNarrationCommand(
	input: ProductionNarrationInput,
	sdk: ProductionNarrationSdk,
	resources: readonly CommandResourceDelivery[] = [],
	mediaLibrary?: ProductionMediaLibrary,
	signal?: AbortSignal,
): Promise<ProductionMediaCommandResult> {
	return serializeProductionCollection(input.editId, () => runProductionNarrationCommandOwned(input, sdk, resources, mediaLibrary, signal), signal);
}

async function runProductionNarrationCommandOwned(
	input: ProductionNarrationInput,
	sdk: ProductionNarrationSdk,
	resources: readonly CommandResourceDelivery[] = [],
	mediaLibrary?: ProductionMediaLibrary,
	signal?: AbortSignal,
): Promise<ProductionMediaCommandResult> {
	if (!sdk.host?.narration?.generate) {
		return refusal(input, "capability-unavailable", "Narration generation is not available.");
	}
	if (!voiceIsCurated(input.voice) || input.shotIds.length === 0 || input.shotIds.length > 100 || input.attempt < 1 || !Number.isSafeInteger(input.attempt)) {
		return refusal(input, "input-invalid", "voice, shotIds, and attempt must be bounded.");
	}
	const documents = new ProductionDocumentService(sdk);
	const service = new ProductionService(documents);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") {
		return refusal(input, "legacy-revision-required", "Admit an edit revision before generating narration.");
	}
	if (current.document.revision.editId !== input.editId || !sameEditRevision(current.document.revision, input.expectedRevision)) {
		return refusal(input, "revision-conflict", "The edit changed since the expected revision.");
	}
	const accepted = (await service.load(input.editId))?.accepted;
	if (!accepted || !sameReference(accepted.reference, input.acceptedRevision)) {
		return refusal(input, "accepted-source-mismatch", "The accepted production revision is no longer current.");
	}
	const shots = [...new Set(input.shotIds)].map((shotId) => accepted.shots.find((shot) => shot.shotId === shotId));
	if (shots.some((shot) => !shot)) return refusal(input, "accepted-source-mismatch", "Every requested shot must be accepted.");
	const acceptedShots = shots.filter((shot): shot is NonNullable<(typeof shots)[number]> => shot !== undefined);
	let revision = input.expectedRevision;
	const generated: NonNullable<ProductionMediaCommandResult["data"]["shots"]> = [];
	const narrationFolder = await resolveProjectFolder({ editId: input.editId, section: "Narration" });
	try {
		for (const shot of acceptedShots) {
			const existingPending = input.newVersion ? undefined : selectNarrationPendingJob(accepted.pendingJobs, shot, accepted.reference, input.voice);
			const failedPending = input.newVersion ? undefined : accepted.pendingJobs?.find((job) => job.status === "failed" && job.role === "narration" && job.shotId === shot.shotId && job.shotRevision === shot.revision && job.voice === input.voice && sameReference(job.acceptedRevision, accepted.reference) && !job.jobRef);
			if (failedPending && !existingPending) return refusal(input, failedPending.failureReason ?? "producer-failed", failedPending.failureMessage ?? CLOUD_JOB_UNAVAILABLE_MESSAGE);
			const idempotencyKey = existingPending?.idempotencyKey ?? await operationKey(input, shot.shotId);
			let response: NarrationResponse;
			let recoveredPending: ProductionPendingJob | undefined;
			if (existingPending) {
				const settled = await pollPendingNarrationJob(existingPending.jobRef, sdk, input, shot.narration, signal);
				if (!settled || isCloudJobPendingPoll(settled)) return pending(input, cloudJobPendingMessage("Narration", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision);
				if (isCloudJobUnavailablePoll(settled)) {
					const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: existingPending.idempotencyKey });
					return result(input, { status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: cleared.documentRevision });
				}
				if (isCloudJobTerminalPoll(settled)) {
					const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: existingPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
					return result(input, { status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: failed.documentRevision });
				}
				response = settled;
			} else {
				try {
					response = await sdk.host.narration.generate({
						text: shot.narration,
						voice: input.voice,
						format: "wav",
						alignment: true,
						filesDestination: {
							folder: narrationFolder,
							name: `${shot.shotId}-${input.attempt}.wav`,
						},
						idempotencyKey,
						timeoutMs: 30_000,
					});
				} catch (error) {
					if (error instanceof Error && isCloudJobTransportTimeout(error)) {
						try {
							response = await sdk.host.narration.generate({
								text: shot.narration,
								voice: input.voice,
								format: "wav",
								alignment: true,
								filesDestination: {
									folder: narrationFolder,
									name: `${shot.shotId}-${input.attempt}.wav`,
								},
								idempotencyKey,
								timeoutMs: 30_000,
							});
						} catch (retryError) {
							if (!isCloudJobPendingError(retryError)) throw retryError;
							const jobRef = cloudJobPendingRef(retryError);
							if (!jobRef) throw retryError;
								recoveredPending = pendingJob(input, shot, idempotencyKey, jobRef);
							const savedPending = await service.recordPendingJob({ reference: accepted.reference, expectedRevision: revision, pendingJob: recoveredPending });
							revision = savedPending.documentRevision;
							const settled = await pollPendingNarrationJob(jobRef, sdk, input, shot.narration, signal);
							if (!settled || isCloudJobPendingPoll(settled)) return pending(input, cloudJobPendingMessage("Narration", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision);
							if (isCloudJobUnavailablePoll(settled)) {
								const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey });
								return result(input, { status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: cleared.documentRevision });
							}
							if (isCloudJobTerminalPoll(settled)) {
								const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
								return result(input, { status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: failed.documentRevision });
							}
							response = settled;
						}
					} else {
						if (!isCloudJobPendingError(error)) throw error;
						const jobRef = cloudJobPendingRef(error);
						if (!jobRef) throw error;
						const pendingRecord = pendingJob(input, shot, idempotencyKey, jobRef);
						const savedPending = await service.recordPendingJob({ reference: accepted.reference, expectedRevision: revision, pendingJob: pendingRecord });
						revision = savedPending.documentRevision;
						const settled = await pollPendingNarrationJob(jobRef, sdk, input, shot.narration, signal);
						if (!settled || isCloudJobPendingPoll(settled)) return pending(input, cloudJobPendingMessage("Narration", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision);
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
		const imported = await runProductionImportCommand({
				editId: input.editId,
				expectedRevision: revision,
				acceptedRevision: input.acceptedRevision,
				shotId: shot.shotId,
				shotRevision: shot.revision,
				role: "narration",
				idempotencyKey,
				publishedFiles: {
					publicId: response.resource.publicId,
					path: response.resource.path,
				},
				alignment: response.alignment?.words.map((word) => ({
					text: word.word,
					start: word.startMs / 1_000,
					end: word.endMs / 1_000,
				})),
			}, sdk, resources, mediaLibrary);
			const completed = importResult(input, imported);
			if (completed.data.status !== "completed" || !completed.data.revision || !completed.data.shots?.[0]) return completed;
			revision = completed.data.revision;
			const pendingToClear = existingPending ?? recoveredPending;
			if (pendingToClear) revision = (await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: pendingToClear.idempotencyKey })).documentRevision;
			generated.push(completed.data.shots[0]);
		}
		return result(input, {
			status: "completed",
			message: `Generated and imported ${generated.length} narration track${generated.length === 1 ? "" : "s"}.`,
			revision,
			shots: generated,
		});
	} catch (error) {
		if (error instanceof EditRevisionConflictError || error instanceof ProductionRevisionSupersededError) return refusal(input, "revision-conflict", "The edit changed while collecting media. Refresh the edit and collect the same job; do not generate another version.");
		if (error instanceof Error && isCloudJobTransportTimeout(error)) return refusal(input, "producer-timeout", CLOUD_JOB_TIMEOUT_MESSAGE);
		if (isCloudJobPendingError(error)) {
			return pending(input, cloudJobPendingMessage("Narration"));
		}
		if (isCloudJobUnavailableError(error)) return refusal(input, "producer-failed", CLOUD_JOB_UNAVAILABLE_MESSAGE);
		return refusal(input, "producer-failed", cloudJobProducerFailureMessage("Narration"));
	}
}
