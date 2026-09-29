import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { resolveNumberAtTime } from "@/animation/values";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "./audio-constants";
import {
	clampReverbWet,
	quantizeReverbDecay,
	REVERB_DECAY_DEFAULT_SECONDS,
	type ElementReverb,
} from "@/media/reverb";
import { computeFadeEnvelope } from "./fade";
import type { TimelineElement } from "./types";
const DEFAULT_STEP_SECONDS = 1 / 60;

export type AudioCapableElement = Extract<
	TimelineElement,
	{ type: "audio" | "video" }
>;

export function clampDb(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, value));
}

export function dBToLinear(db: number): number {
	return 10 ** (clampDb(db) / 20);
}

export function getElementVolume({
	element,
}: {
	element: AudioCapableElement;
}): number {
	const value = element.params.volume;
	return typeof value === "number" ? value : 0;
}

export function isElementMuted({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return element.params.muted === true;
}

// Reverb is a post-fader send level, not a wet/dry crossfade: the dry signal is
// always mixed at full level and the send adds the room on top. Playback and the
// export mixdown both read the clip's room through this one accessor.
export function getElementReverb({
	element,
}: {
	element: AudioCapableElement;
}): ElementReverb | null {
	const rawWet = element.params["reverb.wet"];
	const wet = clampReverbWet(typeof rawWet === "number" ? rawWet : 0);
	if (wet <= 0) {
		return null;
	}

	const rawDecay = element.params["reverb.decay"];
	return {
		wet,
		decaySeconds: quantizeReverbDecay(
			typeof rawDecay === "number" ? rawDecay : REVERB_DECAY_DEFAULT_SECONDS,
		),
	};
}

export function getFadeSeconds({
	element,
	edge,
}: {
	element: AudioCapableElement;
	edge: "in" | "out";
}): number {
	const value =
		edge === "in"
			? element.params.fadeInSeconds
			: element.params.fadeOutSeconds;
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, value)
		: 0;
}

export function hasFade({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return (
		getFadeSeconds({ element, edge: "in" }) > 0 ||
		getFadeSeconds({ element, edge: "out" }) > 0
	);
}

export function resolveFadeEnvelope({
	element,
	localTime,
}: {
	element: AudioCapableElement;
	localTime: number;
}): number {
	return computeFadeEnvelope({
		fadeInSeconds: getFadeSeconds({ element, edge: "in" }),
		fadeOutSeconds: getFadeSeconds({ element, edge: "out" }),
		durationSeconds: element.duration / TICKS_PER_SECOND,
		localTime,
	});
}

export function hasAnimatedVolume({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return (
		hasKeyframesForPath({
			animations: element.animations,
			propertyPath: "volume",
		}) || hasFade({ element })
	);
}

import { TICKS_PER_SECOND } from "@/wasm";

export function resolveEffectiveAudioGain({
	element,
	trackMuted = false,
	localTime,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	localTime: number;
}): number {
	if (trackMuted || isElementMuted({ element })) {
		return 0;
	}

	const resolvedDb = resolveNumberAtTime({
		baseValue: getElementVolume({ element }),
		animations: element.animations,
		propertyPath: "volume",
		localTime: Math.round(localTime * TICKS_PER_SECOND),
	});

	return dBToLinear(resolvedDb) * resolveFadeEnvelope({ element, localTime });
}

export function buildWaveformGainSamples({
	element,
	count,
}: {
	element: AudioCapableElement;
	count: number;
}): number[] {
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	return Array.from({ length: count }, (_, i) => {
		const localTime = ((i + 0.5) / count) * durationSeconds;
		return resolveEffectiveAudioGain({ element, localTime });
	});
}

export function buildAudioGainAutomation({
	element,
	trackMuted = false,
	fromLocalTime,
	toLocalTime,
	stepSeconds = DEFAULT_STEP_SECONDS,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	fromLocalTime: number;
	toLocalTime: number;
	stepSeconds?: number;
}): Array<{ localTime: number; gain: number }> {
	const startTime = Math.max(0, fromLocalTime);
	const endTime = Math.max(startTime, toLocalTime);
	const safeStep =
		Number.isFinite(stepSeconds) && stepSeconds > 0
			? stepSeconds
			: DEFAULT_STEP_SECONDS;
	const points: Array<{ localTime: number; gain: number }> = [];

	for (let localTime = startTime; localTime < endTime; localTime += safeStep) {
		points.push({
			localTime,
			gain: resolveEffectiveAudioGain({
				element,
				trackMuted,
				localTime,
			}),
		});
	}

	points.push({
		localTime: endTime,
		gain: resolveEffectiveAudioGain({
			element,
			trackMuted,
			localTime: endTime,
		}),
	});

	return points;
}
