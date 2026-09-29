import type { MediaAsset } from "@/media/types";
import { collectAudioElements, createAudioContext } from "@/media/audio";
import type { AudioCapableElement } from "@/timeline/audio-state";
import { clampDb, getElementVolume } from "@/timeline/audio-state";
import type { SceneTracks } from "@/timeline";
import {
	computeVolumeOffsetDb,
	measureLoudness,
	type LoudnessMeasurement,
} from "@/media/loudness/r128";
import {
	collectAudibleChannels,
	measureElementLoudnessInWorker,
} from "@/media/loudness/loudness-worker-client";
import type { CollectedAudioElement } from "@/media/audio";

export interface LoudnessTarget {
	trackId: string;
	elementId: string;
}

export interface NormalizedElementResult {
	trackId: string;
	elementId: string;
	measuredLufs: number;
	appliedGainDb: number | null;
	previousVolumeDb: number;
	nextVolumeDb: number | null;
}

export const NORMALIZATION_TARGETS = [-14, -16, -23] as const;
export type NormalizationTargetLufs = (typeof NORMALIZATION_TARGETS)[number];
export const DEFAULT_NORMALIZATION_TARGET = -14;

export function isNormalizationTargetLufs(value: number): value is NormalizationTargetLufs {
	return (NORMALIZATION_TARGETS as readonly number[]).includes(value);
}

async function measureCollectedElement({
	element,
}: {
	element: CollectedAudioElement;
}): Promise<LoudnessMeasurement> {
	try {
		return await measureElementLoudnessInWorker({ element });
	} catch (error) {
		// The same-origin worker may be unavailable in some host contexts; fall
		// back to the identical synchronous measurement.
		console.warn("Loudness worker unavailable, measuring on main thread:", error);
		return measureLoudness({
			channels: collectAudibleChannels({ element }),
			sampleRate: element.buffer.sampleRate,
		});
	}
}

export async function measureTargetsLoudness({
	tracks,
	mediaAssets,
	targets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	targets: LoudnessTarget[];
}): Promise<Map<string, LoudnessMeasurement>> {
	const audioContext = createAudioContext();
	const collected = await collectAudioElements({
		tracks,
		mediaAssets,
		audioContext,
	});

	const byId = new Map(
		collected.map((element) => [element.timelineElement.id, element]),
	);

	const measurements = new Map<string, LoudnessMeasurement>();
	await Promise.all(
		targets.map(async (target) => {
			const collectedElement = byId.get(target.elementId);
			if (!collectedElement) return;
			const measurement = await measureCollectedElement({ element: collectedElement });
			measurements.set(target.elementId, measurement);
		}),
	);

	return measurements;
}

export function computeNormalizedVolume({
	element,
	measurement,
	targetLufs,
}: {
	element: AudioCapableElement;
	measurement: LoudnessMeasurement;
	targetLufs: number;
}): {
	previousVolumeDb: number;
	appliedGainDb: number | null;
	nextVolumeDb: number | null;
} {
	const previousVolumeDb = getElementVolume({ element });
	const appliedGainDb = computeVolumeOffsetDb({
		measuredLufs: measurement.integratedLufs,
		targetLufs,
	});
	const nextVolumeDb =
		appliedGainDb === null ? null : clampDb(previousVolumeDb + appliedGainDb);
	return { previousVolumeDb, appliedGainDb, nextVolumeDb };
}
