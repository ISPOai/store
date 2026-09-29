import { resolveProjectFolder } from "@/services/storage/project-folder";
import { serializeProductionCollection } from "@/project/production-collection";
import { ProjectRpcError, type FilesListEntry, type HostApi } from "@ispo/sdk";
import type { ProductionImportSdk } from "@/media/production-import";
import { productionMediaId } from "@/media/production-import";
import type { ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";
import { EditRevisionConflictError, ProductionRevisionSupersededError } from "./production-types";
import type {
	ProductionAcceptanceResult,
	ProductionAnimationCandidate,
	ProductionImageAspectRatio,
	ProductionMediaVersion,
	ProductionPendingJob,
} from "./production-types";
import type {
	ProductionAnimateCommandResult,
	ProductionAnimateInput,
} from "@/services/project-command-types";
import { canonicalEditRevision } from "@/services/project-command-types";
import { CLOUD_JOB_TIMEOUT_MESSAGE, CLOUD_JOB_UNAVAILABLE_MESSAGE, cloudJobPendingMessage, cloudJobPendingRef, cloudJobProducerFailureMessage, cloudJobTerminalMessage, inlineCloudJobPollOptions, isCloudJobPendingError, isCloudJobPendingPoll, isCloudJobTerminalPoll, isCloudJobTransportTimeout, isCloudJobUnavailableError, isCloudJobUnavailablePoll, pollCloudJob, type CloudJobPendingPoll, type CloudJobPollOptions, type CloudJobSucceeded } from "@/services/cloud-job-poll";
import { collectCloudFile } from "@/services/cloud-job-files";
import { Input, ALL_FORMATS, BufferSource } from "mediabunny";

const MAX_SHOTS = 100;
const MIN_DURATION_SECONDS = 3;
const MAX_DURATION_SECONDS = 15;

export interface ProductionAnimationSdk extends ProductionImportSdk {
	host: {
		sceneVideo: HostApi["sceneVideo"];
		cloudJobs?: Pick<HostApi["cloudJobs"], "get">;
	};
	pendingJobPoll?: CloudJobPollOptions;
}

type SceneVideoResponse = Awaited<ReturnType<ProductionAnimationSdk["host"]["sceneVideo"]["generate"]>>;

function sceneVideoRequest(input: ProductionAnimateInput, startImagePublicId: string, shot: { shotId: string; motionBrief: string }, durationSeconds: number, ratio: ProductionImageAspectRatio, idempotencyKey: string, folder: string): Parameters<HostApi["sceneVideo"]["generate"]>[0] {
	const request: Parameters<HostApi["sceneVideo"]["generate"]>[0] = {
		startImagePublicId, motionBrief: shot.motionBrief, durationSeconds, aspectRatio: ratio,
		generateAudio: input.model?.modelKey === "h3-max-turbo-image-to-video",
		filesDestination: { folder, name: `${shot.shotId}.mp4` },
		idempotencyKey, timeoutMs: 30_000,
	};
	if (input.model) request.model = input.model;
	return request;
}

function sameReference(left: ProductionAnimateInput["acceptedRevision"], right: ProductionAnimateInput["acceptedRevision"]): boolean {
	return left.editId === right.editId && left.documentIntentRevision === right.documentIntentRevision && left.productionRevisionId === right.productionRevisionId && left.contentDigest === right.contentDigest;
}

function sameRevision(left: ProductionAnimateInput["expectedRevision"], right: ProductionAnimateInput["expectedRevision"]): boolean {
	return left.editId === right.editId && left.intentRevision === right.intentRevision && left.digest === right.digest;
}

function aspectRatio(canvas: { width: number; height: number }): ProductionImageAspectRatio {
	const ratio = canvas.width / canvas.height;
	const values: Record<ProductionImageAspectRatio, number> = {
		"1:1": 1,
		"16:9": 16 / 9,
		"9:16": 9 / 16,
		"4:3": 4 / 3,
		"3:4": 3 / 4,
		"21:9": 21 / 9,
	};
	return (Object.keys(values) as ProductionImageAspectRatio[]).reduce((nearest, candidate) => Math.abs(Math.log(ratio / values[candidate])) < Math.abs(Math.log(ratio / values[nearest])) ? candidate : nearest, "1:1");
}

function clampedDuration(seconds: number): { durationSeconds: number; note?: string } {
	const rounded = Math.round(seconds);
	const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, rounded));
	return durationSeconds === rounded ? { durationSeconds } : { durationSeconds, note: ` Shot duration ${seconds}s was clamped to the host range ${MIN_DURATION_SECONDS}–${MAX_DURATION_SECONDS}s.` };
}

function sourceFromImage(image: ProductionMediaVersion | undefined): ProductionAnimationCandidate["sourceImage"] | null {
	if (!image || image.mediaType !== "image") return null;
	const publicId = image.filesRef?.publicId ?? ("publishedFiles" in image ? image.publishedFiles?.publicId : undefined);
	if (!publicId) return null;
	return {
		mediaId: image.mediaId,
		mediaRevision: image.mediaRevision,
		publicId,
		...(image.filesRef?.revision ? { revision: image.filesRef.revision } : {}),
		digest: image.digest,
	};
}

function response(input: ProductionAnimateInput, data: Omit<ProductionAnimateCommandResult["data"], "operation" | "editId" | "supported">): ProductionAnimateCommandResult {
	return { kind: "json", data: { supported: true, operation: "production-animate", editId: input.editId, ...data } };
}

function refusal(input: ProductionAnimateInput, reason: NonNullable<ProductionAnimateCommandResult["data"]["reason"]>, message: string): ProductionAnimateCommandResult {
	return response(input, { status: "refused", reason, message });
}

function pending(input: ProductionAnimateInput, jobRef: string, revision?: ProductionAnimateCommandResult["data"]["revision"]): ProductionAnimateCommandResult {
	const data: Omit<ProductionAnimateCommandResult["data"], "operation" | "editId" | "supported"> = { status: "pending", jobRef, message: "Scene animation is still in progress; the Cloud job continues on the host. Re-run this command to collect it." };
	if (revision) data.revision = revision;
	return response(input, data);
}

function pendingJob(input: ProductionAnimateInput, shot: { shotId: string; revision: number }, idempotencyKey: string, jobRef: string): ProductionPendingJob {
	return {
		role: "animation",
		jobRef,
		idempotencyKey,
		acceptedRevision: structuredClone(input.acceptedRevision),
		shotId: shot.shotId,
		shotRevision: shot.revision,
		pendingSince: Date.now(),
	};
}

export function selectAnimationPendingJob(
	jobs: readonly ProductionPendingJob[] | undefined,
	shot: { shotId: string; revision: number },
	reference: ProductionAnimateInput["acceptedRevision"],
): ProductionPendingJob | undefined {
	return jobs
		?.filter((job) => (job.status ?? "pending") === "pending")
		.filter((job) => job.role === "animation" && job.shotId === shot.shotId && job.shotRevision === shot.revision && sameReference(job.acceptedRevision, reference) && Boolean(job.jobRef))
		.map((job, index) => ({ job, index }))
		.sort((leftEntry, rightEntry) => {
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

async function recordAnimationPending(
	service: ProductionService,
	job: ProductionPendingJob,
	expectedRevision: ProductionAnimateInput["expectedRevision"],
	sourceImage: ProductionAnimationCandidate["sourceImage"],
): Promise<ProductionAcceptanceResult> {
	let revision = expectedRevision;
	for (let attempt = 0; ; attempt += 1) {
		try {
			return await service.recordPendingJob({ reference: job.acceptedRevision, expectedRevision: revision, pendingJob: job });
		} catch (error) {
			if (attempt >= 2 || !(error instanceof EditRevisionConflictError || error instanceof ProductionRevisionSupersededError)) throw error;
			const latest = await service.load(job.acceptedRevision.editId);
			const shot = latest?.accepted?.shots.find((item) => item.shotId === job.shotId);
			const image = sourceFromImage(shot?.imageVersion);
			if (!latest?.documentRevision || !latest.accepted || !sameReference(latest.accepted.reference, job.acceptedRevision)
				|| shot?.revision !== job.shotRevision || !image || image.mediaId !== sourceImage.mediaId
				|| image.mediaRevision !== sourceImage.mediaRevision || image.digest !== sourceImage.digest || image.publicId !== sourceImage.publicId) throw error;
			revision = canonicalEditRevision(latest.documentRevision);
		}
	}
}

async function settledSceneVideo(job: CloudJobSucceeded, sdk: ProductionAnimationSdk, durationSeconds: number): Promise<SceneVideoResponse> {
	const collected = await collectCloudFile(job, sdk.files.list, "video", "video/mp4");
	const { file: resource, published } = collected;
	const metadata = await decodeVideoMetadata(collected.bytes);
	if (!durationCoversShot(metadata.durationSeconds, durationSeconds)) throw new Error("Cloud scene-video job is too short for the requested shot.");
	return {
		resource: {
			kind: "files",
			publicId: published.publicId,
			path: published.path,
			digest: resource.digest,
			byteLength: resource.byteLength,
			mimeType: "video/mp4",
			durationSeconds: metadata.durationSeconds,
			dimensions: { width: metadata.width, height: metadata.height },
		},
		model: { modelKey: job.model.modelKey, modelVersion: job.model.modelVersion },
	};
}

function durationCoversShot(actual: number, expected: number): boolean {
	// Encoders can append frames or audio padding. Placement trims to the shot;
	// preserve the measured source duration and reject only insufficient footage.
	return Number.isFinite(actual) && actual > 0 && actual + Math.max(0.1, expected * 0.02) >= expected;
}

async function decodeVideoMetadata(bytes: Uint8Array): Promise<{ durationSeconds: number; width: number; height: number }> {
	const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
	try {
		const durationSeconds = await input.computeDuration();
		const track = await input.getPrimaryVideoTrack();
		if (!track || !Number.isFinite(durationSeconds) || durationSeconds <= 0
			|| !Number.isFinite(track.displayWidth) || track.displayWidth <= 0
			|| !Number.isFinite(track.displayHeight) || track.displayHeight <= 0) {
			throw new Error("Cloud scene-video bytes have invalid video metadata.");
		}
		return { durationSeconds, width: track.displayWidth, height: track.displayHeight };
	} finally {
		input.dispose();
	}
}

async function pollPending(jobRef: string, sdk: ProductionAnimationSdk, durationSeconds: number, signal?: AbortSignal): Promise<SceneVideoResponse | { terminalMessage: string } | { unavailable: true } | CloudJobPendingPoll | null> {
	if (!sdk.host.cloudJobs) return null;
	const result = await pollCloudJob(jobRef, sdk.host.cloudJobs.get, { ...inlineCloudJobPollOptions(sdk.pendingJobPoll), ...(signal ? { signal } : {}) });
	if (result.kind === "succeeded") return settledSceneVideo(result.job, sdk, durationSeconds);
	if (result.kind === "terminal") return { terminalMessage: cloudJobTerminalMessage(result.job) };
	if (result.kind === "unavailable") return { unavailable: true };
	if (result.kind === "pending") return { pending: true, ...(result.lastState ? { state: result.lastState } : {}) };
	return null;
}

async function addToMediaLibrary(candidate: ProductionAnimationCandidate, input: ProductionAnimateInput, sdk: ProductionAnimationSdk, mediaLibrary: ProductionMediaLibrary): Promise<void> {
	const published = (await sdk.files.list()).find((entry: FilesListEntry) => entry.publicId === candidate.resource.publicId);
	if (!published?.url) throw new Error("Generated scene video is not readable from Files.");
	const fetched = await fetch(published.url);
	if (!fetched.ok) throw new Error(`Files returned ${fetched.status} for generated scene video.`);
	const bytes = new Uint8Array(await fetched.arrayBuffer());
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
	if (digest !== candidate.resource.digest) throw new Error("Generated scene video digest does not match its Files artifact.");
	await mediaLibrary.import({
		editId: input.editId,
		mediaId: candidate.mediaId,
		mediaRevision: candidate.mediaRevision,
		role: "video",
		name: published.name,
		mimeType: "video/mp4",
		digest,
		file: new File([bytes], published.name, { type: "video/mp4" }),
		width: candidate.resource.dimensions.width,
		height: candidate.resource.dimensions.height,
		duration: candidate.resource.durationSeconds,
	});
}

export async function runProductionAnimateCommand(input: ProductionAnimateInput, sdk: ProductionAnimationSdk, mediaLibrary?: ProductionMediaLibrary, signal?: AbortSignal): Promise<ProductionAnimateCommandResult> {
	return serializeProductionCollection(input.editId, () => runProductionAnimateCommandOwned(input, sdk, mediaLibrary, signal), signal);
}

async function runProductionAnimateCommandOwned(input: ProductionAnimateInput, sdk: ProductionAnimationSdk, mediaLibrary?: ProductionMediaLibrary, signal?: AbortSignal): Promise<ProductionAnimateCommandResult> {
	if (!sdk.host?.sceneVideo?.generate) return refusal(input, "capability-unavailable", "Scene video generation is not available.");
	if (input.shotIds.length === 0 || input.shotIds.length > MAX_SHOTS) return refusal(input, "input-invalid", "shotIds must contain between 1 and 100 accepted shots.");
	const documents = new ProductionDocumentService(sdk);
	const service = new ProductionService(documents);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") return refusal(input, "edit-not-found", `Edit ${input.editId} was not found.`);
	if (!sameRevision(current.document.revision, input.expectedRevision)) return refusal(input, "revision-conflict", "The edit changed since the expected revision.");
	const snapshot = await service.load(input.editId);
	const accepted = snapshot?.accepted;
	if (!accepted || !sameReference(accepted.reference, input.acceptedRevision)) return refusal(input, "revision-conflict", "The accepted production revision is no longer current.");
	const requested = [...new Set(input.shotIds)].map((shotId) => accepted.shots.find((shot) => shot.shotId === shotId));
	if (requested.some((shot) => !shot)) return refusal(input, "accepted-source-mismatch", "Every requested shot must be accepted.");
	if (input.motionBrief !== undefined && (!input.motionBrief.trim() || input.motionBrief.length > 2500)) return refusal(input, "input-invalid", "Motion brief must contain 1–2500 characters.");
	const shots = requested.filter((shot): shot is NonNullable<(typeof requested)[number]> => shot !== undefined).map((shot) => input.motionBrief === undefined ? shot : { ...shot, motionBrief: input.motionBrief });
	const results: NonNullable<ProductionAnimateCommandResult["data"]["shots"]> = [];
	let revision = input.expectedRevision;
	const report = (data: Omit<ProductionAnimateCommandResult["data"], "operation" | "editId" | "supported">): ProductionAnimateCommandResult => response(input, { revision: canonicalEditRevision(revision), shots: [...results], ...data });
	const refuse = (reason: NonNullable<ProductionAnimateCommandResult["data"]["reason"]>, message: string): ProductionAnimateCommandResult => report({ status: "refused", reason, message });
	let clampedAny = false;
	let recoveryJobRef: string | undefined;
	let recoveryKey: string | undefined;
	const animationFolder = await resolveProjectFolder({ editId: input.editId, section: "Animation" });
	try {
		for (const shot of shots) {
			let existingPending = input.newVersion ? undefined : selectAnimationPendingJob(accepted.pendingJobs, shot, accepted.reference);
			const sourceImage = sourceFromImage(shot.imageVersion);
			if (!sourceImage) return refuse("accepted-source-mismatch", `Shot ${shot.shotId} has no accepted image Files identity.`);
			const existing = input.newVersion || existingPending ? undefined : [...(shot.animationCandidates ?? [])].reverse().find((candidate) =>
				candidate.shotRevision === shot.revision && sameReference(candidate.acceptedRevision, accepted.reference)
				&& candidate.sourceImage.mediaId === sourceImage.mediaId && candidate.sourceImage.mediaRevision === sourceImage.mediaRevision
				&& candidate.sourceImage.digest === sourceImage.digest && candidate.sourceImage.publicId === sourceImage.publicId
				&& candidate.motionBrief === shot.motionBrief
				&& (input.model === undefined || (candidate.model?.modelKey === input.model.modelKey && candidate.model.modelVersion === input.model.modelVersion)));
			const failedPending = input.newVersion ? undefined : [...(accepted.pendingJobs ?? [])].reverse().find((job) => job.status === "failed" && job.role === "animation" && job.shotId === shot.shotId && job.shotRevision === shot.revision && sameReference(job.acceptedRevision, accepted.reference));
			if (failedPending && !existingPending && !existing) {
				if (!failedPending.jobRef) return refuse(failedPending.failureReason ?? "producer-failed", failedPending.failureMessage ?? CLOUD_JOB_UNAVAILABLE_MESSAGE);
				existingPending = failedPending;
			}
			const duration = clampedDuration(shot.durationMs / 1_000);
			if (duration.note) clampedAny = true;
			const version = input.newVersion ? (shot.animationCandidates?.length ?? 0) + (accepted.pendingJobs?.filter((job) => job.role === "animation" && job.shotId === shot.shotId).length ?? 0) + 1 : undefined;
			const keyDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ editId: input.editId, productionRevisionId: input.acceptedRevision.productionRevisionId, shotId: shot.shotId, shotRevision: shot.revision, motionBrief: shot.motionBrief, version, model: input.model })));
			const operationKey = existingPending?.idempotencyKey ?? existing?.idempotencyKey ?? `production-animation-${Array.from(new Uint8Array(keyDigest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 56)}`;
			recoveryKey = operationKey;
			recoveryJobRef = existingPending?.jobRef;
			if (existing) {
				if (mediaLibrary) await addToMediaLibrary(existing, input, sdk, mediaLibrary);
				results.push({ shotId: shot.shotId, candidateId: existing.idempotencyKey, publicId: existing.resource.publicId, path: existing.resource.path, digest: existing.resource.digest, durationSeconds: existing.resource.durationSeconds });
				continue;
			}
			// Reconcile the durable host job before submission. This also recovers a
			// completed/failed job whose original reply or worker was lost.
			if (!existingPending && sdk.host.cloudJobs) {
				try {
					const retained = await sdk.host.cloudJobs.get({ idempotencyKey: operationKey, route: "scene-video" });
					if (!retained.jobRef) throw new Error("Retained scene video has no owner job reference.");
					existingPending = pendingJob(input, shot, operationKey, retained.jobRef);
					if ("model" in retained) existingPending.model = retained.model;
					recoveryJobRef = retained.jobRef;
					revision = (await recordAnimationPending(service, existingPending, revision, sourceImage)).documentRevision;
				} catch (error) {
					if (!(error instanceof ProjectRpcError) || error.code !== "invalid-job-ref") throw error;
				}
			}
			let generated: SceneVideoResponse;
			if (existingPending) {
				const settled = await pollPending(existingPending.jobRef, sdk, duration.durationSeconds, signal);
				if (!settled || isCloudJobPendingPoll(settled)) return report({ status: "pending", jobRef: existingPending.jobRef, message: cloudJobPendingMessage("Scene animation", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision: canonicalEditRevision(revision) });
				if (isCloudJobUnavailablePoll(settled)) {
					const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: existingPending.idempotencyKey });
					return report({ status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: canonicalEditRevision(cleared.documentRevision) });
				}
				if (isCloudJobTerminalPoll(settled)) {
					const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: existingPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
					return report({ status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: canonicalEditRevision(failed.documentRevision) });
				}
				generated = settled;
			} else {
				try {
					generated = await sdk.host.sceneVideo.generate(sceneVideoRequest(input, sourceImage.publicId, shot, duration.durationSeconds, aspectRatio(accepted.canvas), operationKey, animationFolder));
				} catch (error) {
					if (error instanceof Error && isCloudJobTransportTimeout(error)) {
						try {
							generated = await sdk.host.sceneVideo.generate(sceneVideoRequest(input, sourceImage.publicId, shot, duration.durationSeconds, aspectRatio(accepted.canvas), operationKey, animationFolder));
						} catch (retryError) {
							if (!isCloudJobPendingError(retryError)) throw retryError;
							const jobRef = cloudJobPendingRef(retryError);
							if (!jobRef) throw retryError;
							const recoveredPending = pendingJob(input, shot, operationKey, jobRef);
							recoveryJobRef = jobRef;
							const savedPending = await recordAnimationPending(service, recoveredPending, revision, sourceImage);
							revision = savedPending.documentRevision;
							const settled = await pollPending(jobRef, sdk, duration.durationSeconds, signal);
							if (!settled || isCloudJobPendingPoll(settled)) return report({ status: "pending", jobRef, message: cloudJobPendingMessage("Scene animation", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision: canonicalEditRevision(revision) });
							if (isCloudJobUnavailablePoll(settled)) {
								const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey });
								return report({ status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: canonicalEditRevision(cleared.documentRevision) });
							}
							if (isCloudJobTerminalPoll(settled)) {
								const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: recoveredPending.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
								return report({ status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: canonicalEditRevision(failed.documentRevision) });
							}
							generated = settled;
						}
					} else {
						if (!isCloudJobPendingError(error)) throw error;
						const jobRef = cloudJobPendingRef(error);
						if (!jobRef) throw error;
						const pendingRecord = pendingJob(input, shot, operationKey, jobRef);
						recoveryJobRef = jobRef;
						const savedPending = await recordAnimationPending(service, pendingRecord, revision, sourceImage);
						revision = savedPending.documentRevision;
						const settled = await pollPending(jobRef, sdk, duration.durationSeconds, signal);
						if (!settled || isCloudJobPendingPoll(settled)) return report({ status: "pending", jobRef, message: cloudJobPendingMessage("Scene animation", isCloudJobPendingPoll(settled) ? settled.state : undefined), revision: canonicalEditRevision(revision) });
						if (isCloudJobUnavailablePoll(settled)) {
							const cleared = await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: pendingRecord.idempotencyKey });
							return report({ status: "refused", reason: "producer-failed", message: CLOUD_JOB_UNAVAILABLE_MESSAGE, revision: canonicalEditRevision(cleared.documentRevision) });
						}
						if (isCloudJobTerminalPoll(settled)) {
							const failed = await service.markPendingJobFailed({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: pendingRecord.idempotencyKey, reason: "producer-failed", message: settled.terminalMessage });
							return report({ status: "refused", reason: "producer-failed", message: settled.terminalMessage, revision: canonicalEditRevision(failed.documentRevision) });
						}
						generated = settled;
					}
				}
			}
			if (!durationCoversShot(generated.resource.durationSeconds, duration.durationSeconds) || generated.resource.mimeType !== "video/mp4") return refuse("producer-failed", "Scene video producer returned an invalid duration or media type.");
			const mediaId = await productionMediaId({ editId: input.editId, acceptedRevision: input.acceptedRevision, shotId: shot.shotId, role: "video" }, generated.resource.digest);
			if (input.model && (generated.model?.modelKey !== input.model.modelKey || generated.model.modelVersion !== input.model.modelVersion)) return refuse("input-invalid", "The saved animation job uses a different model. Collect it without a model override, or request a new version explicitly.");
			const candidate: ProductionAnimationCandidate = { kind: "scene-video", idempotencyKey: operationKey, candidateId: operationKey, version: { mediaRevision: generated.resource.digest }, mediaId, mediaRevision: generated.resource.digest, motionBrief: shot.motionBrief, sourceImage, ...(generated.model ? { model: structuredClone(generated.model) } : {}), aspectRatio: aspectRatio(accepted.canvas), dimensions: structuredClone(generated.resource.dimensions), acceptedRevision: structuredClone(accepted.reference), shotId: shot.shotId, shotRevision: shot.revision, resource: generated.resource };
			// Commit each verified result before starting another shot or importing it.
			// A later failure must not erase completed work from discovery/recovery.
			revision = (await service.recordAnimationCandidates({ reference: accepted.reference, expectedRevision: revision, candidates: [candidate] })).documentRevision;
			if (recoveryJobRef) revision = (await service.clearPendingJob({ reference: accepted.reference, expectedRevision: revision, idempotencyKey: operationKey })).documentRevision;
			results.push({ shotId: shot.shotId, candidateId: operationKey, publicId: candidate.resource.publicId, path: candidate.resource.path, digest: candidate.resource.digest, durationSeconds: candidate.resource.durationSeconds });
			if (mediaLibrary) await addToMediaLibrary(candidate, input, sdk, mediaLibrary);
		}
		return report({ status: "completed", message: `Generated ${results.length} scene animation${results.length === 1 ? "" : "s"}.${clampedAny ? " Some shot durations were clamped to the host range." : ""}`, revision: canonicalEditRevision(revision), shots: results });
	} catch (error) {
		if (error instanceof EditRevisionConflictError || error instanceof ProductionRevisionSupersededError) {
			const result = refuse("revision-conflict", `The edit changed while saving the animation result. Refresh the edit and collect the same job; do not generate another version. Host generation key: ${recoveryKey ?? "not submitted"}.`);
			if (recoveryJobRef) result.data.jobRef = recoveryJobRef;
			return result;
		}
		if (error instanceof Error && isCloudJobTransportTimeout(error)) return refuse("producer-timeout", CLOUD_JOB_TIMEOUT_MESSAGE);
		if (isCloudJobPendingError(error)) return report({ ...pending(input, cloudJobPendingRef(error) ?? "").data });
		if (isCloudJobUnavailableError(error)) return refuse("producer-failed", CLOUD_JOB_UNAVAILABLE_MESSAGE);
		const capabilityUnavailable = error instanceof Error && /authority|denied|grant|permission/i.test(error.message);
		const failure = refuse(capabilityUnavailable ? "capability-unavailable" : "producer-failed", capabilityUnavailable ? "The host did not grant access to scene animation generation." : cloudJobProducerFailureMessage("Scene animation"));
		// Keep the producer's bounded diagnostic and the recovery identity. A generic
		// retry hint hides input failures and can cause duplicate paid submissions.
		const rpc = error && typeof error === "object" && "rpcError" in error ? error.rpcError : error;
		if (rpc && typeof rpc === "object" && "message" in rpc && typeof rpc.message === "string") {
			const detail = rpc.message.replace(/^Error invoking remote method '[^']+':\s*/, "").slice(0, 500);
			if (detail) failure.data.message = `Scene animation failed: ${detail}`;
		}
		if (rpc && typeof rpc === "object" && "code" in rpc && typeof rpc.code === "string") failure.data.message += ` Code: ${rpc.code.slice(0, 80)}.`;
		if (rpc && typeof rpc === "object" && "jobRef" in rpc && typeof rpc.jobRef === "string") failure.data.jobRef = rpc.jobRef.slice(0, 256);
		if (recoveryJobRef) failure.data.jobRef = recoveryJobRef;
		return failure;
	}
}
