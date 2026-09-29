import type { RetimeConfig } from "@/timeline";
import {
	isSpeedCurvePresent,
	splitSpeedCurveAtFraction,
} from "@/retime/curve";
import { getSourceTimeAtClipTime } from "./resolve";

export function getSourceSpanAtClipTime({
	clipTime,
	retime,
	clipDuration,
}: {
	clipTime: number;
	retime?: RetimeConfig;
	clipDuration?: number;
}): number {
	return Math.max(
		0,
		getSourceTimeAtClipTime({ clipTime, retime, clipDuration }),
	);
}

export function splitRetimeAtClipTime({
	retime,
	splitClipTime,
	clipDuration,
}: {
	retime?: RetimeConfig;
	splitClipTime: number;
	clipDuration?: number;
}): {
	left: RetimeConfig | undefined;
	right: RetimeConfig | undefined;
} {
	if (!retime || !isSpeedCurvePresent({ curve: retime.curve })) {
		return { left: retime, right: retime };
	}

	const duration =
		clipDuration != null && clipDuration > 0 ? clipDuration : splitClipTime;
	const fraction = duration > 0 ? splitClipTime / duration : 0;
	const { left, right } = splitSpeedCurveAtFraction({
		curve: retime.curve ?? [],
		fraction,
	});

	const leftCurve = left.length > 0 ? left : undefined;
	const rightCurve = right.length > 0 ? right : undefined;
	const maintainPitch = retime.maintainPitch;

	return {
		left: leftCurve
			? { rate: retime.rate, maintainPitch, curve: leftCurve }
			: undefined,
		right: rightCurve
			? { rate: retime.rate, maintainPitch, curve: rightCurve }
			: undefined,
	};
}

export function adjustRetimeForTrimChange({
	retime,
}: {
	retime?: RetimeConfig;
	clipTrimTime: number;
	side: "start" | "end";
}): RetimeConfig | undefined {
	return retime;
}
