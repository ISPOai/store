import { isProductionCollectionActive } from "./production-collection";
import { entities, files, host } from "@ispo/sdk";
import { runProductionAnimateCommand, type ProductionAnimationSdk } from "./production-animation-command";
import { ProductionDocumentService } from "./production-document-service";
import { ProductionService } from "./production-service";
import type { EditRevision, ProductionPendingJob } from "./production-types";
import { runProductionImageCommand, type ProductionImageSdk } from "@/services/project-image-command";
import { runProductionNarrationCommand, type ProductionNarrationSdk } from "@/services/project-narration-command";
import { CLOUD_JOB_MAX_WAIT_MS, CLOUD_JOB_TIMEOUT_MESSAGE, type CloudJobState } from "@/services/cloud-job-poll";
import { MountedProductionMediaLibrary, SdkProductionMediaLibrary, type MountedMediaStore, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";

export type ProductionPendingJobPollerSdk = ProductionImageSdk & ProductionNarrationSdk & ProductionAnimationSdk;

interface PollerOptions {
	service?: ProductionDocumentService;
	wakeDelayMs?: number;
	now?: () => number;
	waitForPoll?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
	waitForWake?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}

const MIN_LOOP_DELAY_MS = 3_000;
const MAX_LOOP_DELAY_MS = 15_000;
const IDLE_LOG_INTERVAL_MS = 30_000;

function pendingKey(job: ProductionPendingJob): string {
	return `${job.role}:${job.idempotencyKey}`;
}

function pendingIdentityKey(job: ProductionPendingJob): string {
	return [
		job.role,
		job.acceptedRevision.editId,
		job.acceptedRevision.documentIntentRevision,
		job.acceptedRevision.productionRevisionId,
		job.acceptedRevision.contentDigest,
		job.shotId,
		job.shotRevision,
	].join("\0");
}

function remainingWaitMs(job: ProductionPendingJob, now: () => number): number {
	if (job.pendingSince === undefined) return CLOUD_JOB_MAX_WAIT_MS;
	const pendingSince = typeof job.pendingSince === "number"
		? job.pendingSince
		: Number.isFinite(Number(job.pendingSince))
			? Number(job.pendingSince)
			: Date.parse(job.pendingSince);
	if (!Number.isFinite(pendingSince)) return CLOUD_JOB_MAX_WAIT_MS;
	return Math.max(0, CLOUD_JOB_MAX_WAIT_MS - Math.max(0, now() - pendingSince));
}

type CollectOutcome = "completed" | "pending" | "skipped" | "failed";

interface CollectResult {
	outcome: CollectOutcome;
	state?: CloudJobState;
	revision?: EditRevision;
	lastError?: { shotId: string; jobRef: string; reason: string; message: string };
}

/**
 * Collects durable Cloud jobs without tying their lifetime to a command RPC.
 * The pending row is the hand-off: it survives a reload and the document
 * subscription wakes this loop when a command records a new job.
 */
export class ProductionPendingJobPoller {
	private readonly documents: ProductionDocumentService;
	private readonly serviceOverride?: ProductionDocumentService;
	private readonly wakeDelayMs: number;
	private readonly now: () => number;
	private readonly waitForPoll?: PollerOptions["waitForPoll"];
	private readonly waitForWakeOverride?: PollerOptions["waitForWake"];
	private stopped = true;
	private controller: AbortController | undefined;
	private subscription: { close(): void } | undefined;
	private wakeResolver: (() => void) | undefined;
	private wakeRequested = false;
	private nextLoopAt = 0;
	private readonly ownRevisionKeys = new Set<string>();
	private readonly inFlight = new Set<string>();

	constructor(
		private readonly sdk: ProductionPendingJobPollerSdk,
		private readonly mediaLibrary: ProductionMediaLibrary,
		options: PollerOptions = {},
	) {
		this.documents = options.service ?? new ProductionDocumentService(sdk);
		this.serviceOverride = options.service;
		this.wakeDelayMs = options.wakeDelayMs ?? 3_000;
		this.now = options.now ?? Date.now;
		this.waitForPoll = options.waitForPoll;
		this.waitForWakeOverride = options.waitForWake;
	}

	private revisionKey(editId: string, revision: { storageCasRevision: string; intentRevision: string; digest: string }): string {
		return `${editId}:${revision.storageCasRevision}:${revision.intentRevision}:${revision.digest}`;
	}

	private rememberOwnRevision(editId: string, revision: { storageCasRevision: string; intentRevision: string; digest: string }): void {
		this.ownRevisionKeys.add(this.revisionKey(editId, revision));
	}

	private createProductionService(): ProductionService {
		return new ProductionService(this.serviceOverride ?? new ProductionDocumentService(this.sdk));
	}

	start(editId: string): () => void {
		this.stop();
		this.stopped = false;
		this.controller = new AbortController();
		this.nextLoopAt = 0;
		try {
			this.subscription = this.documents.subscribe(editId, (loaded) => {
				if (this.ownRevisionKeys.delete(this.revisionKey(editId, loaded.revision))) return;
				this.wake();
			});
		} catch (error) {
			console.error("[production-poller] subscription failed", { editId, error });
		}
		void this.run(editId, this.controller.signal);
		return () => this.stop();
	}

	stop(): void {
		this.stopped = true;
		this.controller?.abort();
		this.controller = undefined;
		this.subscription?.close();
		this.subscription = undefined;
		this.inFlight.clear();
		this.ownRevisionKeys.clear();
		this.wakeRequested = false;
		this.wakeResolver?.();
		this.wakeResolver = undefined;
	}

	private wake(): void {
		this.wakeRequested = true;
		this.wakeResolver?.();
	}

	private async waitForWake(delayMs: number, signal: AbortSignal): Promise<void> {
		if (signal.aborted) return;
		if (this.waitForWakeOverride) {
			await this.waitForWakeOverride(delayMs, signal);
			return;
		}
		const startedAt = this.now();
		const minimumLoopDelay = Math.max(MIN_LOOP_DELAY_MS, this.wakeDelayMs);
		let deadline = Math.max(this.nextLoopAt, startedAt + delayMs);
		const minimumDeadline = Math.max(this.nextLoopAt, startedAt + minimumLoopDelay);
		await new Promise<void>((resolve) => {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const finish = () => {
				if (timer !== undefined) clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				this.wakeResolver = undefined;
				resolve();
			};
			const arm = () => {
				const remaining = Math.max(0, deadline - this.now());
				if (remaining === 0) finish();
				else timer = setTimeout(finish, remaining);
			};
			const onAbort = () => {
				finish();
			};
			signal.addEventListener("abort", onAbort, { once: true });
			this.wakeResolver = () => {
				if (this.wakeRequested) {
					this.wakeRequested = false;
					deadline = Math.min(deadline, minimumDeadline);
				}
				if (timer !== undefined) clearTimeout(timer);
				arm();
			};
			arm();
		});
	}

	private async run(editId: string, signal: AbortSignal): Promise<void> {
		let backoffMs = MIN_LOOP_DELAY_MS;
		let lastIdleLogAt: number | undefined;
		while (!this.stopped && !signal.aborted) {
			let pendingCount = 0;
			let collected = 0;
			let awaiting = 0;
			let errors = 0;
			let active = false;
			let lastError: { shotId: string; jobRef: string; reason: string; message: string } | undefined;
			try {
				const production = this.createProductionService();
				const snapshot = await production.load(editId);
				const pendingJobs = snapshot?.accepted?.pendingJobs?.filter((job) => (job.status ?? "pending") === "pending") ?? [];
				pendingCount = pendingJobs.length;
				const groups = new Map<string, ProductionPendingJob[]>();
				for (const job of pendingJobs) {
					const identity = pendingIdentityKey(job);
					const group = groups.get(identity) ?? [];
					group.push(job);
					groups.set(identity, group);
				}
				for (const group of groups.values()) {
					for (const [index, job] of group.entries()) {
						const result = await this.collect(editId, job, signal, production);
						if (result.state === "awaiting-consent") awaiting += 1;
						if (result.state === "running" || result.state === "awaiting-consent") active = true;
						if (result.lastError) lastError = result.lastError;
						if (result.outcome === "completed") {
							collected += 1;
							for (const duplicate of group.filter((_candidate, duplicateIndex) => duplicateIndex !== index)) {
								await this.clearDuplicate(editId, duplicate, signal, production);
							}
							break;
						}
						if (result.outcome === "pending" || result.outcome === "failed") active = true;
						if (result.outcome === "failed") errors += 1;
					}
				}
			} catch (error) {
				errors += 1;
				lastError = { shotId: "", jobRef: "", reason: "loop-error", message: error instanceof Error ? error.message : String(error) };
				console.error("[production-poller] loop failed", { editId, pending: pendingCount, collected, awaiting, errors, lastError, error });
			}
			const now = this.now();
			const isIdle = pendingCount === 0 && errors === 0;
			if (!isIdle || lastIdleLogAt === undefined || now - lastIdleLogAt >= IDLE_LOG_INTERVAL_MS) {
				console.info("[production-poller] loop", { editId, pending: pendingCount, collected, awaiting, errors, lastError: lastError ?? null });
				if (isIdle) lastIdleLogAt = now;
			}
			const delayMs = active ? backoffMs : MIN_LOOP_DELAY_MS;
			backoffMs = active ? Math.min(MAX_LOOP_DELAY_MS, backoffMs * 2) : MIN_LOOP_DELAY_MS;
			this.nextLoopAt = this.now() + Math.max(MIN_LOOP_DELAY_MS, this.wakeDelayMs);
			await this.waitForWake(delayMs, signal);
		}
	}

	private async clearDuplicate(editId: string, job: ProductionPendingJob, signal: AbortSignal, production: ProductionService): Promise<void> {
		if (signal.aborted || isProductionCollectionActive(editId)) return;
		try {
			const current = await production.load(editId);
			if (!current?.documentRevision || isProductionCollectionActive(editId)) return;
			const cleared = await production.clearPendingJob({
				reference: job.acceptedRevision,
				expectedRevision: current.documentRevision,
				idempotencyKey: job.idempotencyKey,
			});
			this.rememberOwnRevision(editId, cleared.documentRevision);
			console.info("[production-poller] collect", { editId, pending: pendingKey(job), shotId: job.shotId, jobRef: job.jobRef, outcome: "duplicate-cleared", reason: null, message: null });
		} catch (error) {
			console.error("[production-poller] duplicate cleanup failed", { editId, pending: pendingKey(job), shotId: job.shotId, jobRef: job.jobRef, outcome: "error", reason: "error", message: error instanceof Error ? error.message : String(error), error });
		}
	}

	private async collect(editId: string, job: ProductionPendingJob, signal: AbortSignal, production: ProductionService): Promise<CollectResult> {
		const key = pendingKey(job);
		if (this.inFlight.has(key) || isProductionCollectionActive(editId)) return { outcome: "skipped" };
		this.inFlight.add(key);
		let outcome: CollectOutcome = "failed";
		let state: CloudJobState | undefined;
		let lastError: CollectResult["lastError"];
		try {
			const remaining = remainingWaitMs(job, this.now);
			if (remaining === 0) {
				lastError = { shotId: job.shotId, jobRef: job.jobRef, reason: "producer-timeout", message: CLOUD_JOB_TIMEOUT_MESSAGE };
				const snapshot = await production.load(editId);
				if (snapshot?.documentRevision) {
					const failed = await production.markPendingJobFailed({
						reference: job.acceptedRevision,
						expectedRevision: snapshot.documentRevision,
						idempotencyKey: job.idempotencyKey,
						reason: "producer-timeout",
						message: CLOUD_JOB_TIMEOUT_MESSAGE,
					});
					this.rememberOwnRevision(editId, failed.documentRevision);
				}
				outcome = "failed";
				return { outcome, lastError };
			}
			const current = await production.load(editId);
			if (!current?.documentRevision || !current.accepted || isProductionCollectionActive(editId)) {
				outcome = "skipped";
				return { outcome };
			}
			const pendingPoll = { fastPath: true, maxWaitMs: remaining, now: this.now, ...(this.waitForPoll ? { waitForPoll: this.waitForPoll } : {}), onState: (nextState: CloudJobState) => { state = nextState; }, signal };
			const pollingSdk = this.sdk.host.cloudJobs
				? {
					...this.sdk,
					host: {
						...this.sdk.host,
						cloudJobs: {
							...this.sdk.host.cloudJobs,
							get: async (request: { jobRef: string }) => {
								const snapshot = await this.sdk.host.cloudJobs!.get(request);
								state = snapshot.state;
								return snapshot;
							},
						},
					},
				} as ProductionPendingJobPollerSdk
				: this.sdk;
			let result: { data: { status?: string; revision?: EditRevision; reason?: string; message?: string } };
			if (job.role === "visual") {
				result = await runProductionImageCommand({
					editId,
					expectedRevision: current.documentRevision,
					acceptedRevision: job.acceptedRevision,
					shotIds: [job.shotId],
					attempt: 1,
					...(job.model ? { model: structuredClone(job.model) } : {}),
					...(job.visualBrief ? { visualBrief: job.visualBrief } : {}),
				}, { ...pollingSdk, pendingJobPoll: pendingPoll }, this.mediaLibrary, signal);
			} else if (job.role === "narration") {
				if (!job.voice) {
					outcome = "skipped";
					return { outcome };
				}
				result = await runProductionNarrationCommand({
					editId,
					expectedRevision: current.documentRevision,
					acceptedRevision: job.acceptedRevision,
					shotIds: [job.shotId],
					attempt: 1,
					voice: job.voice,
				}, { ...pollingSdk, pendingJobPoll: pendingPoll }, [], this.mediaLibrary, signal);
			} else {
				result = await runProductionAnimateCommand({
					editId,
					expectedRevision: current.documentRevision,
					acceptedRevision: job.acceptedRevision,
					shotIds: [job.shotId],
				}, { ...pollingSdk, pendingJobPoll: pendingPoll }, this.mediaLibrary, signal);
			}
			if (result.data.status === "refused" && result.data.reason === "revision-conflict") {
				outcome = "skipped";
				return { outcome };
			}
			if (result.data.status === "refused") {
				lastError = {
					shotId: job.shotId,
					jobRef: job.jobRef,
					reason: result.data.reason ?? "producer-failed",
					message: result.data.message ?? "The production job was refused.",
				};
				const retryableRefusal = (state === undefined && (lastError.reason === "producer-failed" || lastError.reason === "producer-timeout")) || state === "awaiting-consent" || state === "running";
				if (retryableRefusal) {
					outcome = "failed";
					return { outcome, ...(state ? { state } : {}), lastError };
				}
				const latest = await production.load(editId);
				if (latest?.documentRevision) {
					const failed = await production.markPendingJobFailed({
						reference: job.acceptedRevision,
						expectedRevision: latest.documentRevision,
						idempotencyKey: job.idempotencyKey,
						reason: "producer-failed",
						message: lastError.message,
					});
					this.rememberOwnRevision(editId, failed.documentRevision);
				}
				outcome = "failed";
				return { outcome, ...(state ? { state } : {}), lastError };
			}
			outcome = result.data.status === "completed" ? "completed" : result.data.status === "pending" ? "pending" : "failed";
			if (result.data.revision) this.rememberOwnRevision(editId, result.data.revision);
			return { outcome, ...(state ? { state } : {}), ...(lastError ? { lastError } : {}) };
		} catch (error) {
			lastError = { shotId: job.shotId, jobRef: job.jobRef, reason: "error", message: error instanceof Error ? error.message : String(error) };
			console.error("[production-poller] collect failed", { editId, pending: key, outcome: "error", ...lastError, error });
			outcome = "failed";
			return { outcome, ...(state ? { state } : {}), lastError };
		} finally {
			this.inFlight.delete(key);
			console.info("[production-poller] collect", { editId, pending: key, shotId: job.shotId, jobRef: job.jobRef, outcome, reason: lastError?.reason ?? null, message: lastError?.message ?? null });
		}
	}
}

export function createMountedProductionPendingJobPoller(mountedMedia: MountedMediaStore): ProductionPendingJobPoller {
	return new ProductionPendingJobPoller({ entities, files, host } as ProductionPendingJobPollerSdk, new MountedProductionMediaLibrary(new SdkProductionMediaLibrary({ entities, files }), mountedMedia));
}

let mountedPollerOwner: symbol | undefined;
let mountedPollerStop: (() => void) | undefined;

export function startMountedProductionPendingJobPoller(mountedMedia: MountedMediaStore, editId: string): () => void {
	mountedPollerStop?.();
	const owner = Symbol("mounted-production-poller");
	const stopPoller = createMountedProductionPendingJobPoller(mountedMedia).start(editId);
	mountedPollerOwner = owner;
	mountedPollerStop = () => {
		stopPoller();
		if (mountedPollerOwner === owner) {
			mountedPollerOwner = undefined;
			mountedPollerStop = undefined;
		}
	};
	return mountedPollerStop;
}
