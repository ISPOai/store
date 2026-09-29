import type { RetimeConfig, SpeedCurveKeyframe } from "@/timeline";
import { clampRetimeRate } from "@/retime/rate";
import { getSpeedCurveAverageRate } from "@/retime/curve";
import { generateUUID } from "@/utils/id";

export function buildConstantRetime({
	rate,
	maintainPitch = false,
}: {
	rate: number;
	maintainPitch?: boolean;
}): RetimeConfig {
	return { rate: clampRetimeRate({ rate }), maintainPitch };
}

export type SpeedCurvePresetName =
	| "montage"
	| "hero"
	| "bullet"
	| "jump-cut"
	| "flash-in"
	| "flash-out";

export const SPEED_CURVE_PRESET_NAMES: readonly SpeedCurvePresetName[] = [
	"montage",
	"hero",
	"bullet",
	"jump-cut",
	"flash-in",
	"flash-out",
];

export function isSpeedCurvePresetName(
	value: unknown,
): value is SpeedCurvePresetName {
	return (
		typeof value === "string" &&
		(SPEED_CURVE_PRESET_NAMES as readonly string[]).includes(value)
	);
}

function keyframe({
	time,
	rate,
	segmentToNext,
}: {
	time: number;
	rate: number;
	segmentToNext: SpeedCurveKeyframe["segmentToNext"];
}): SpeedCurveKeyframe {
	return {
		id: generateUUID(),
		time,
		rate,
		segmentToNext,
	};
}

/**
 * Speed-ramp presets, approximated from CapCut's velocity-ramp vocabulary.
 * `time` is the normalized clip position in [0,1] and `rate` is the playback
 * multiplier. Each preset is a sensible starting point and remains fully
 * editable through the curve editor.
 */
const SPEED_CURVE_PRESETS: Record<
	SpeedCurvePresetName,
	() => SpeedCurveKeyframe[]
> = {
	// Quick, punchy cuts: ramp up, hold fast, ramp back down.
	montage: () => [
		keyframe({ time: 0, rate: 1, segmentToNext: "linear" }),
		keyframe({ time: 0.25, rate: 4, segmentToNext: "linear" }),
		keyframe({ time: 0.75, rate: 4, segmentToNext: "linear" }),
		keyframe({ time: 1, rate: 1, segmentToNext: "linear" }),
	],
	// Dramatic slow-mo: fast intro, slow middle, fast outro.
	hero: () => [
		keyframe({ time: 0, rate: 3, segmentToNext: "linear" }),
		keyframe({ time: 0.35, rate: 0.5, segmentToNext: "linear" }),
		keyframe({ time: 0.65, rate: 0.5, segmentToNext: "linear" }),
		keyframe({ time: 1, rate: 3, segmentToNext: "linear" }),
	],
	// Bullet time: fast, normal, fast.
	bullet: () => [
		keyframe({ time: 0, rate: 4, segmentToNext: "linear" }),
		keyframe({ time: 0.5, rate: 1, segmentToNext: "linear" }),
		keyframe({ time: 1, rate: 4, segmentToNext: "linear" }),
	],
	// Sudden speed jumps (hold interpolation reads as a hard cut).
	"jump-cut": () => [
		keyframe({ time: 0, rate: 1, segmentToNext: "step" }),
		keyframe({ time: 0.33, rate: 2.5, segmentToNext: "step" }),
		keyframe({ time: 0.66, rate: 0.7, segmentToNext: "step" }),
		keyframe({ time: 1, rate: 2, segmentToNext: "step" }),
	],
	// Quick burst at the start, settling to normal.
	"flash-in": () => [
		keyframe({ time: 0, rate: 4, segmentToNext: "linear" }),
		keyframe({ time: 0.35, rate: 1, segmentToNext: "linear" }),
		keyframe({ time: 1, rate: 1, segmentToNext: "linear" }),
	],
	// Normal until a quick burst at the end.
	"flash-out": () => [
		keyframe({ time: 0, rate: 1, segmentToNext: "linear" }),
		keyframe({ time: 0.65, rate: 1, segmentToNext: "linear" }),
		keyframe({ time: 1, rate: 4, segmentToNext: "linear" }),
	],
};

export function buildSpeedCurvePreset({
	name,
	maintainPitch = false,
}: {
	name: SpeedCurvePresetName;
	maintainPitch?: boolean;
}): RetimeConfig {
	const curve = SPEED_CURVE_PRESETS[name]();
	return {
		rate: clampRetimeRate({ rate: getSpeedCurveAverageRate({ curve }) }),
		maintainPitch,
		curve,
	};
}

export function buildCustomSpeedCurveRetime({
	curve,
	maintainPitch = false,
}: {
	curve: SpeedCurveKeyframe[];
	maintainPitch?: boolean;
}): RetimeConfig {
	return {
		rate: clampRetimeRate({ rate: getSpeedCurveAverageRate({ curve }) }),
		maintainPitch,
		curve,
	};
}
