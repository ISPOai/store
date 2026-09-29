import type { HostApi } from "@ispo/sdk";

export type CloudJobSnapshot = Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
export type CloudJobState = CloudJobSnapshot["state"];
export type CloudJobSucceeded = Extract<CloudJobSnapshot, { state: "succeeded" }>;
export type CloudJobFailure = Extract<CloudJobSnapshot, { state: "failed" | "cancelled" | "outcome-unknown" }>;
export type CloudJobTerminal = CloudJobSucceeded | CloudJobFailure;
export interface CloudJobPendingError {
	readonly code: "pending";
	readonly jobRef: string;
}

export type CloudJobUnavailableCode = "job-unavailable" | "invalid-job-ref";

export interface CloudJobUnavailableError {
	readonly code: CloudJobUnavailableCode;
}

export const CLOUD_JOB_TIMEOUT_MESSAGE = "The media producer timed out before returning a result. Please try again.";
export const CLOUD_JOB_UNAVAILABLE_MESSAGE = "The requested Cloud job is no longer available. Re-run this command to start a new generation.";
const CLOUD_JOB_TERMINAL_FAILURE_MESSAGE = "The Cloud job failed on the host. Please try again.";

export const CLOUD_JOB_MAX_WAIT_MS = 15 * 60 * 1_000;
export const CLOUD_JOB_FAST_POLL_MS = 3_000;
export const CLOUD_JOB_SLOW_POLL_MS = 10_000;
export const CLOUD_JOB_FAST_POLL_WINDOW_MS = 30_000;
export const CLOUD_JOB_FAST_PATH_MAX_WAIT_MS = 20_000;

export function inlineCloudJobPollOptions(options: CloudJobPollOptions | undefined): CloudJobPollOptions {
	if (options?.fastPath === false) return options;
	const maxWaitMs = Math.min(options?.maxWaitMs ?? CLOUD_JOB_FAST_PATH_MAX_WAIT_MS, CLOUD_JOB_FAST_PATH_MAX_WAIT_MS);
	return { ...options, maxWaitMs, fastPath: true };
}

export function cloudJobPendingMessage(operation: "Storyboard image" | "Narration" | "Scene animation", state?: CloudJobState): string {
	if (state === "awaiting-consent") return `${operation} generation is waiting for your approval. The Cloud job continues on the host.`;
	return `${operation} generation is still in progress; the Cloud job continues on the host. Re-run this command to collect it.`;
}

export interface CloudJobPollOptions {
	now?: () => number;
	waitForPoll?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
	maxWaitMs?: number;
	/** A command invocation may only take a short look at an already-running job. */
	fastPath?: boolean;
	onState?: (state: CloudJobState, message: string) => void;
	signal?: AbortSignal;
}

export type CloudJobPollResult =
	| { kind: "succeeded"; job: CloudJobSucceeded }
	| { kind: "terminal"; job: CloudJobFailure }
	| { kind: "pending"; lastState?: CloudJobState }
	| { kind: "unavailable" };

export type CloudJobPendingPoll = { pending: true; state?: CloudJobState };
export type CloudJobTerminalPoll = { terminalMessage: string };

export function isCloudJobPendingPoll(value: unknown): value is CloudJobPendingPoll {
	return Boolean(value && typeof value === "object" && "pending" in value && value.pending === true);
}

export function isCloudJobUnavailablePoll(value: unknown): value is { unavailable: true } {
	return Boolean(value && typeof value === "object" && "unavailable" in value && value.unavailable === true);
}

export function isCloudJobTerminalPoll(value: unknown): value is CloudJobTerminalPoll {
	return Boolean(value && typeof value === "object" && "terminalMessage" in value && typeof value.terminalMessage === "string");
}

function errorRecord(error: unknown): { code?: unknown; jobRef?: unknown; rpcError?: unknown; message?: unknown } | undefined {
	return error && (typeof error === "object" || typeof error === "function")
		? error as { code?: unknown; jobRef?: unknown; rpcError?: unknown; message?: unknown }
		: undefined;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pendingJobRef(error: unknown): string | undefined {
	const candidate = errorRecord(error);
	const directRef = candidate?.code === "pending" ? nonEmptyString(candidate.jobRef) : undefined;
	if (directRef) return directRef;
	const rpcError = errorRecord(candidate?.rpcError);
	const rpcRef = rpcError?.code === "pending" ? nonEmptyString(rpcError.jobRef) : undefined;
	if (rpcRef) return rpcRef;
	const message = nonEmptyString(candidate?.message);
	return message?.match(/still running as managed Cloud job '([^']+)'/i)?.[1];
}

export function cloudJobPendingRef(error: unknown): string | undefined {
	return pendingJobRef(error);
}

export function isCloudJobPendingError(error: unknown): error is CloudJobPendingError {
	return pendingJobRef(error) !== undefined;
}

function unavailableCode(error: unknown): CloudJobUnavailableCode | undefined {
	const candidate = errorRecord(error);
	if (candidate?.code === "job-unavailable" || candidate?.code === "invalid-job-ref") return candidate.code;
	const rpcError = errorRecord(candidate?.rpcError);
	if (rpcError?.code === "job-unavailable" || rpcError?.code === "invalid-job-ref") return rpcError.code;
	const message = nonEmptyString(candidate?.message);
	if (message && /is not owned by this project/i.test(message)) return "invalid-job-ref";
	if (message && /is no longer available/i.test(message)) return "job-unavailable";
	return undefined;
}

export function isCloudJobUnavailableError(error: unknown): error is CloudJobUnavailableError {
	return unavailableCode(error) !== undefined;
}

export function cloudJobProducerFailureMessage(operation: "Storyboard image" | "Narration" | "Scene animation"): string {
	return `${operation} generation failed on the host. Please try again.`;
}

export function isCloudJobTransportTimeout(error: Error & { readonly code?: string }): boolean {
	return error.code === "timeout" || /timed out after/i.test(error.message);
}

function isTerminal(job: CloudJobSnapshot): job is CloudJobTerminal {
	return job.state === "succeeded" || job.state === "failed" || job.state === "cancelled" || job.state === "outcome-unknown";
}

function isSucceeded(job: CloudJobTerminal): job is CloudJobSucceeded {
	return job.state === "succeeded";
}

function stateMessage(state: CloudJobState): string {
	return state === "awaiting-consent" ? "waiting for your approval" : `Cloud job is ${state}`;
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Cloud job polling was cancelled."));
			return;
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		function finish(error?: Error): void {
			if (timer !== undefined) clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			if (error) reject(error);
			else resolve();
		}
		function onAbort(): void { finish(new Error("Cloud job polling was cancelled.")); }
		signal?.addEventListener("abort", onAbort, { once: true });
		timer = setTimeout(() => finish(), delayMs);
	});
}

export async function pollCloudJob(
	jobRef: string,
	get: (input: { jobRef: string }) => Promise<CloudJobSnapshot>,
	options: CloudJobPollOptions = {},
): Promise<CloudJobPollResult> {
	const now = options.now ?? Date.now;
	const waitForPoll = options.waitForPoll ?? abortableDelay;
	const maxWaitMs = Math.min(Math.max(options.maxWaitMs ?? CLOUD_JOB_MAX_WAIT_MS, 0), CLOUD_JOB_MAX_WAIT_MS);
	const fastPath = options.fastPath === true;
	let activeElapsedMs = 0;
	let lastObservedAt = now();
	let lastState: CloudJobState | undefined;
	let firstPoll = true;

	if (options.signal?.aborted) return { kind: "pending", lastState };

	while (activeElapsedMs < maxWaitMs) {
		const delayMs = lastState === "awaiting-consent" || activeElapsedMs >= CLOUD_JOB_FAST_POLL_WINDOW_MS ? CLOUD_JOB_SLOW_POLL_MS : CLOUD_JOB_FAST_POLL_MS;
		try {
			if (!(fastPath && firstPoll)) await waitForPoll(delayMs, options.signal);
		} catch (error) {
			if (options.signal?.aborted) return { kind: "pending", lastState };
			throw error;
		}
		if (options.signal?.aborted) return { kind: "pending", lastState };
		firstPoll = false;
		let job: CloudJobSnapshot;
		try {
			job = await get({ jobRef });
		} catch (error) {
			if (options.signal?.aborted) return { kind: "pending", lastState };
			if (isCloudJobPendingError(error)) {
				lastObservedAt = now();
				lastState = "awaiting-consent";
				options.onState?.(lastState, stateMessage(lastState));
				if (fastPath) return { kind: "pending", lastState };
				continue;
			}
			if (isCloudJobUnavailableError(error)) return { kind: "unavailable" };
			throw error;
		}
		if (options.signal?.aborted) return { kind: "pending", lastState };
		const observedAt = now();
		if (lastState !== "awaiting-consent" && job.state !== "awaiting-consent") {
			activeElapsedMs += Math.max(0, observedAt - lastObservedAt);
		}
		lastObservedAt = observedAt;
		lastState = job.state;
		options.onState?.(job.state, stateMessage(job.state));
		if (isTerminal(job)) {
			return isSucceeded(job) ? { kind: "succeeded", job } : { kind: "terminal", job };
		}
		if (fastPath && job.state !== "running") return { kind: "pending", lastState };
		if (activeElapsedMs >= maxWaitMs) return { kind: "pending", lastState };
	}

	return { kind: "pending", lastState };
}

export function cloudJobTerminalMessage(job: CloudJobFailure): string {
	if (job.state === "failed" || job.state === "outcome-unknown") return /Error invoking remote method/i.test(job.error.message) ? CLOUD_JOB_TERMINAL_FAILURE_MESSAGE : job.error.message;
	return "The Cloud job was cancelled.";
}
