import type { LoudnessMeasurement } from "@/media/loudness/r128";
import type { CollectedAudioElement } from "@/media/audio";

const WORKER_ASSET_NAME = "loudness-worker.js";

type WorkerResponse =
	| { id: number; integratedLufs: number; samplePeakDb: number }
	| { id: number; error: string };

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<
	number,
	{
		resolve: (measurement: LoudnessMeasurement) => void;
		reject: (error: Error) => void;
	}
>();

function getWorker(): Worker {
	if (worker) return worker;

	const workerUrl = new URL(WORKER_ASSET_NAME, import.meta.url);
	const created = new Worker(workerUrl, {
		name: "opencut-loudness",
		type: "module",
	});

	created.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
		const data = event.data;
		const entry = pending.get(data.id);
		if (!entry) return;

		pending.delete(data.id);
		if ("error" in data) {
			entry.reject(new Error(data.error));
		} else {
			entry.resolve({
				integratedLufs: data.integratedLufs,
				samplePeakDb: data.samplePeakDb,
			});
		}
	});

	created.addEventListener("error", (event) => {
		const error = new Error(
			event.message || "Loudness measurement worker failed.",
		);
		for (const entry of pending.values()) entry.reject(error);
		pending.clear();
		worker = null;
		created.terminate();
	});

	worker = created;
	return created;
}

/**
 * Measure integrated loudness off the main thread. `channels` should already
 * be trimmed to the audible region of the clip; their buffers are transferred
 * to the worker.
 */
export function measureLoudnessInWorker({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): Promise<LoudnessMeasurement> {
	const active = getWorker();
	const id = nextRequestId++;

	const promise = new Promise<LoudnessMeasurement>((resolve, reject) => {
		pending.set(id, { resolve, reject });
	});

	active.postMessage(
		{ id, channels, sampleRate },
		{ transfer: channels.map((channel) => channel.buffer) },
	);

	return promise;
}

/**
 * Sample range (inclusive start, exclusive end) of a decoded clip buffer that
 * corresponds to the audible region after trimming. Trim values are in source
 * seconds; retimed clips are measured across the source span uniformly.
 */
export function audibleSampleRange({
	bufferLength,
	sampleRate,
	trimStartSeconds,
	trimEndSeconds,
}: {
	bufferLength: number;
	sampleRate: number;
	trimStartSeconds: number;
	trimEndSeconds: number;
}): { startSample: number; endSample: number } {
	const durationSeconds = bufferLength / sampleRate;
	const startSample = Math.min(
		bufferLength,
		Math.max(0, Math.round(trimStartSeconds * sampleRate)),
	);
	const endSample = Math.min(
		bufferLength,
		Math.max(0, Math.round((durationSeconds - trimEndSeconds) * sampleRate)),
	);
	return {
		startSample,
		endSample: Math.max(startSample, endSample),
	};
}

/**
 * Extract the audible channel data (post-trim) from a collected audio element.
 */
export function collectAudibleChannels({
	element,
}: {
	element: CollectedAudioElement;
}): Float32Array[] {
	const { buffer } = element;
	const { startSample, endSample } = audibleSampleRange({
		bufferLength: buffer.length,
		sampleRate: buffer.sampleRate,
		trimStartSeconds: element.trimStart,
		trimEndSeconds: element.trimEnd,
	});

	const channels: Float32Array[] = [];
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		channels.push(
			buffer.getChannelData(channel).slice(startSample, endSample),
		);
	}
	return channels;
}

/**
 * Measure the integrated loudness of a collected audio element in the worker.
 */
export function measureElementLoudnessInWorker({
	element,
}: {
	element: CollectedAudioElement;
}): Promise<LoudnessMeasurement> {
	return measureLoudnessInWorker({
		channels: collectAudibleChannels({ element }),
		sampleRate: element.buffer.sampleRate,
	});
}
