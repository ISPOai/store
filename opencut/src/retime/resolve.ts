import type { RetimeConfig } from "@/timeline";
import { clampRetimeRate } from "@/retime/rate";
import {
	getSpeedCurveAverageRate,
	getSpeedCurveClipFractionAtSource,
	getSpeedRateAt,
	integrateSpeedCurve,
	isSpeedCurvePresent,
} from "@/retime/curve";

function getSafeRate({ rate }: { rate: number }): number {
	return clampRetimeRate({ rate });
}

function hasCurve({ retime }: { retime?: RetimeConfig }): boolean {
	return isSpeedCurvePresent({ curve: retime?.curve });
}

function getClipDurationForCurve({
	clipTime,
	clipDuration,
}: {
	clipTime: number;
	clipDuration?: number;
}): number {
	if (clipDuration != null && Number.isFinite(clipDuration) && clipDuration > 0) {
		return clipDuration;
	}
	return Math.max(clipTime, 0);
}

export function getSourceTimeAtClipTime({
	clipTime,
	retime,
	clipDuration,
}: {
	clipTime: number;
	retime?: RetimeConfig;
	clipDuration?: number;
}): number {
	if (hasCurve({ retime }) && retime?.curve) {
		const duration = getClipDurationForCurve({ clipTime, clipDuration });
		const fraction = clipTime / duration;
		return duration * integrateSpeedCurve({ curve: retime.curve, to: fraction });
	}
	return clipTime * getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getClipTimeAtSourceTime({
	sourceTime,
	retime,
	clipDuration,
}: {
	sourceTime: number;
	retime?: RetimeConfig;
	clipDuration?: number;
}): number {
	if (hasCurve({ retime }) && retime?.curve) {
		const duration = getClipDurationForCurve({ clipTime: 0, clipDuration });
		if (duration <= 0) {
			return 0;
		}
		const averageRate = getSpeedCurveAverageRate({ curve: retime.curve });
		const sourceFraction = sourceTime / duration;
		const clipFraction = getSpeedCurveClipFractionAtSource({
			curve: retime.curve,
			sourceFraction,
		});
		if (averageRate <= 0) {
			return 0;
		}
		return clipFraction * duration;
	}
	return sourceTime / getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getEffectiveRateAt({
	retime,
	clipTime,
	clipDuration,
}: {
	clipTime?: number;
	retime?: RetimeConfig;
	clipDuration?: number;
}): number {
	if (hasCurve({ retime }) && retime?.curve) {
		if (clipTime != null && clipDuration != null && clipDuration > 0) {
			return getSpeedRateAt({
				curve: retime.curve,
				time: clipTime / clipDuration,
			});
		}
		return getSpeedCurveAverageRate({ curve: retime.curve });
	}
	return getSafeRate({ rate: retime?.rate ?? 1 });
}

export function getTimelineDurationForSourceSpan({
	sourceSpan,
	retime,
}: {
	sourceSpan: number;
	retime?: RetimeConfig;
}): number {
	if (sourceSpan <= 0) {
		return 0;
	}
	if (hasCurve({ retime }) && retime?.curve) {
		const averageRate = getSpeedCurveAverageRate({ curve: retime.curve });
		return sourceSpan / (averageRate > 0 ? averageRate : 1);
	}
	return sourceSpan / getSafeRate({ rate: retime?.rate ?? 1 });
}
