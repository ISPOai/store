import { getBezierPoint } from "@/animation/bezier";
import type { SpeedCurveKeyframe, SpeedCurveSegmentType } from "@/timeline";
import {
	clampRetimeRate,
	DEFAULT_RETIME_RATE,
	MAX_RETIME_RATE,
	MIN_RETIME_RATE,
} from "@/retime/rate";

const BEZIER_SOLVE_ITERATIONS = 20;
const INVERSE_SOLVE_ITERATIONS = 40;
const BEZIER_INTEGRATION_SAMPLES = 24;

function clamp01({ value }: { value: number }): number {
	return Math.max(0, Math.min(1, value));
}

function sortByTimeAscending({
	leftTime,
	rightTime,
}: {
	leftTime: number;
	rightTime: number;
}): number {
	return leftTime - rightTime;
}

function clampKeyframeRate({ rate }: { rate: number }): number {
	return clampRetimeRate({ rate });
}

/**
 * Sorts keyframes by normalized time, clamps times to [0,1] and rates to the
 * supported range, and drops malformed entries. Two keyframes at the same time
 * collapse to the later one (matching scalar-channel upsert semantics).
 */
export function normalizeSpeedCurve({
	curve,
}: {
	curve: SpeedCurveKeyframe[];
}): SpeedCurveKeyframe[] {
	const seenTimes = new Set<number>();
	const sorted = [...curve]
		.filter((key) => Number.isFinite(key.time) && Number.isFinite(key.rate))
		.map((key) => ({
			...key,
			time: clamp01({ value: key.time }),
			rate: clampKeyframeRate({ rate: key.rate }),
		}))
		.sort((left, right) =>
			sortByTimeAscending({ leftTime: left.time, rightTime: right.time }),
		);

	const deduped: SpeedCurveKeyframe[] = [];
	for (const key of sorted) {
		if (seenTimes.has(key.time)) {
			deduped[deduped.length - 1] = key;
			continue;
		}
		seenTimes.add(key.time);
		deduped.push(key);
	}
	return deduped;
}

function getDefaultRightHandle({
	left,
	right,
}: {
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): { dt: number; dv: number } {
	const span = right.time - left.time;
	const valueDelta = right.rate - left.rate;
	return { dt: span / 3, dv: valueDelta / 3 };
}

function getDefaultLeftHandle({
	left,
	right,
}: {
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): { dt: number; dv: number } {
	const span = right.time - left.time;
	const valueDelta = right.rate - left.rate;
	return { dt: -span / 3, dv: -valueDelta / 3 };
}

function solveBezierParameterForTime({
	time,
	left,
	right,
}: {
	time: number;
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): number {
	let lower = 0;
	let upper = 1;
	const rightHandle = left.rightHandle ?? getDefaultRightHandle({ left, right });
	const leftHandle = right.leftHandle ?? getDefaultLeftHandle({ left, right });

	for (let iteration = 0; iteration < BEZIER_SOLVE_ITERATIONS; iteration++) {
		const mid = (lower + upper) / 2;
		const estimate = getBezierPoint({
			progress: mid,
			p0: left.time,
			p1: left.time + rightHandle.dt,
			p2: right.time + leftHandle.dt,
			p3: right.time,
		});
		if (estimate < time) {
			lower = mid;
		} else {
			upper = mid;
		}
	}

	return (lower + upper) / 2;
}

function getBezierRateAt({
	time,
	left,
	right,
}: {
	time: number;
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): number {
	const progress = solveBezierParameterForTime({ time, left, right });
	const rightHandle = left.rightHandle ?? getDefaultRightHandle({ left, right });
	const leftHandle = right.leftHandle ?? getDefaultLeftHandle({ left, right });
	const rate = getBezierPoint({
		progress,
		p0: left.rate,
		p1: left.rate + rightHandle.dv,
		p2: right.rate + leftHandle.dv,
		p3: right.rate,
	});
	return Math.max(MIN_RETIME_RATE, Math.min(MAX_RETIME_RATE, rate));
}

function getSegmentRateAt({
	time,
	left,
	right,
	segmentType,
}: {
	time: number;
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
	segmentType: SpeedCurveSegmentType;
}): number {
	if (segmentType === "step") {
		return left.rate;
	}
	if (segmentType === "linear") {
		const span = right.time - left.time;
		if (span === 0) {
			return right.rate;
		}
		const progress = clamp01({ value: (time - left.time) / span });
		return left.rate + (right.rate - left.rate) * progress;
	}
	return getBezierRateAt({ time, left, right });
}

export function getSpeedRateAt({
	curve,
	time,
}: {
	curve: SpeedCurveKeyframe[];
	time: number;
}): number {
	const keys = normalizeSpeedCurve({ curve });
	if (keys.length === 0) {
		return DEFAULT_RETIME_RATE;
	}

	const first = keys[0];
	const last = keys[keys.length - 1];
	const t = clamp01({ value: time });

	if (t <= first.time) {
		return first.rate;
	}
	if (t >= last.time) {
		return last.rate;
	}

	for (let index = 0; index < keys.length - 1; index++) {
		const left = keys[index];
		const right = keys[index + 1];
		if (t <= right.time) {
			return getSegmentRateAt({
				time: t,
				left,
				right,
				segmentType: left.segmentToNext,
			});
		}
	}

	return last.rate;
}

function integrateBezierSegment({
	from,
	to,
	left,
	right,
}: {
	from: number;
	to: number;
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): number {
	const samples = BEZIER_INTEGRATION_SAMPLES;
	const step = (to - from) / samples;
	let total = 0;
	for (let i = 0; i < samples; i++) {
		const a = from + i * step;
		const b = from + (i + 1) * step;
		const ra = getBezierRateAt({ time: a, left, right });
		const rb = getBezierRateAt({ time: b, left, right });
		total += ((ra + rb) / 2) * step;
	}
	return total;
}

function integrateSegment({
	from,
	to,
	left,
	right,
}: {
	from: number;
	to: number;
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
}): number {
	const segmentType = left.segmentToNext;
	if (segmentType === "step") {
		return left.rate * (to - from);
	}

	if (segmentType === "linear") {
		const span = right.time - left.time;
		if (span === 0) {
			return right.rate * (to - from);
		}
		const slope = (right.rate - left.rate) / span;
		const offset = left.rate - slope * left.time;
		return (
			(0.5 * slope * (to * to - from * from) + offset * (to - from))
		);
	}

	return integrateBezierSegment({ from, to, left, right });
}

/**
 * Integrates the rate curve over normalized time `[from, to]`. The result is in
 * "source-time per clip-duration" units: multiplying by the clip duration yields
 * the source time spanned across that normalized interval.
 */
export function integrateSpeedCurve({
	curve,
	to,
	from = 0,
}: {
	curve: SpeedCurveKeyframe[];
	to: number;
	from?: number;
}): number {
	const keys = normalizeSpeedCurve({ curve });
	if (keys.length === 0) {
		return DEFAULT_RETIME_RATE * Math.max(0, to - from);
	}

	const lo = clamp01({ value: from });
	const hi = clamp01({ value: to });
	if (hi <= lo) {
		return 0;
	}

	let total = 0;
	let cursor = lo;
	const first = keys[0];
	const last = keys[keys.length - 1];

	if (cursor < first.time) {
		const headEnd = Math.min(hi, first.time);
		total += first.rate * (headEnd - cursor);
		cursor = headEnd;
	}

	for (let index = 0; index < keys.length - 1 && cursor < hi; index++) {
		const left = keys[index];
		const right = keys[index + 1];
		if (hi <= left.time) {
			break;
		}
		const segmentStart = Math.max(cursor, left.time);
		const segmentEnd = Math.min(hi, right.time);
		if (segmentEnd > segmentStart) {
			total += integrateSegment({
				from: segmentStart,
				to: segmentEnd,
				left,
				right,
			});
			cursor = segmentEnd;
		}
	}

	if (cursor < hi) {
		total += last.rate * (hi - cursor);
	}

	return total;
}

export function getSpeedCurveAverageRate({
	curve,
}: {
	curve: SpeedCurveKeyframe[];
}): number {
	const total = integrateSpeedCurve({ curve, to: 1 });
	if (total <= 0) {
		return DEFAULT_RETIME_RATE;
	}
	return total;
}

/**
 * Inverts `integrateSpeedCurve` to recover the normalized clip-time fraction at
 * which the accumulated source fraction equals `sourceFraction`. The curve is
 * monotonic in accumulated source time because rates are clamped positive.
 */
export function getSpeedCurveClipFractionAtSource({
	curve,
	sourceFraction,
}: {
	curve: SpeedCurveKeyframe[];
	sourceFraction: number;
}): number {
	const total = integrateSpeedCurve({ curve, to: 1 });
	if (total <= 0) {
		return clamp01({ value: sourceFraction });
	}

	let lower = 0;
	let upper = 1;
	for (let iteration = 0; iteration < INVERSE_SOLVE_ITERATIONS; iteration++) {
		const mid = (lower + upper) / 2;
		const accumulated = integrateSpeedCurve({ curve, to: mid });
		if (accumulated < sourceFraction) {
			lower = mid;
		} else {
			upper = mid;
		}
	}
	return clamp01({ value: (lower + upper) / 2 });
}

export function isSpeedCurvePresent({
	curve,
}: {
	curve?: SpeedCurveKeyframe[];
}): boolean {
	return Boolean(curve && normalizeSpeedCurve({ curve }).length > 0);
}

export type NormalizedSpeedBezier = [number, number, number, number];

const FLAT_VALUE_EPSILON = 1e-6;

/**
 * Bridges a speed-curve segment to the normalized cubic-bezier shape used by the
 * shared bezier graph editor. `referenceSpanValue` mirrors the scalar-channel
 * convention so a flat segment (equal rates) still has a usable Y scale.
 */
export function getNormalizedBezierForSpeedSegment({
	left,
	right,
	referenceSpanValue,
}: {
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
	referenceSpanValue?: number;
}): NormalizedSpeedBezier | null {
	const spanTime = right.time - left.time;
	const spanValue = right.rate - left.rate;
	const effectiveSpanValue =
		Math.abs(spanValue) > FLAT_VALUE_EPSILON
			? spanValue
			: referenceSpanValue !== undefined &&
				  Math.abs(referenceSpanValue) > FLAT_VALUE_EPSILON
				? referenceSpanValue
				: null;

	if (spanTime === 0 || effectiveSpanValue === null) {
		return null;
	}

	const rightHandle = left.rightHandle ?? getDefaultRightHandle({ left, right });
	const leftHandle = right.leftHandle ?? getDefaultLeftHandle({ left, right });

	return [
		clamp01({ value: rightHandle.dt / spanTime }),
		rightHandle.dv / effectiveSpanValue,
		clamp01({ value: 1 + leftHandle.dt / spanTime }),
		1 + leftHandle.dv / effectiveSpanValue,
	];
}

export function getSpeedHandlesForNormalizedBezier({
	left,
	right,
	bezier,
	referenceSpanValue,
}: {
	left: SpeedCurveKeyframe;
	right: SpeedCurveKeyframe;
	bezier: NormalizedSpeedBezier;
	referenceSpanValue?: number;
}): { rightHandle: SpeedCurveKeyframe["rightHandle"]; leftHandle: SpeedCurveKeyframe["leftHandle"] } | null {
	const spanTime = right.time - left.time;
	const spanValue = right.rate - left.rate;
	const effectiveSpanValue =
		Math.abs(spanValue) > FLAT_VALUE_EPSILON
			? spanValue
			: referenceSpanValue !== undefined &&
				  Math.abs(referenceSpanValue) > FLAT_VALUE_EPSILON
				? referenceSpanValue
				: null;

	if (spanTime === 0 || effectiveSpanValue === null) {
		return null;
	}

	const [x1, y1, x2, y2] = bezier;
	const cx1 = clamp01({ value: x1 });
	const cx2 = clamp01({ value: x2 });

	return {
		rightHandle: {
			dt: spanTime * cx1,
			dv: effectiveSpanValue * y1,
		},
		leftHandle: {
			dt: spanTime * (cx2 - 1),
			dv: effectiveSpanValue * (y2 - 1),
		},
	};
}

function scaleKeyframeTime({
	key,
	scale,
	offset,
}: {
	key: SpeedCurveKeyframe;
	scale: number;
	offset: number;
}): SpeedCurveKeyframe {
	const scaleHandle = (
		handle: SpeedCurveKeyframe["leftHandle"],
	): SpeedCurveKeyframe["leftHandle"] =>
		handle ? { dt: handle.dt * scale, dv: handle.dv } : undefined;
	return {
		...key,
		time: clamp01({ value: key.time * scale + offset }),
		leftHandle: scaleHandle(key.leftHandle),
		rightHandle: scaleHandle(key.rightHandle),
	};
}

/**
 * Splits a normalized speed curve at `fraction` into two re-normalized curves.
 * The boundary rate is sampled exactly so accumulated source time is continuous
 * across the split. Crossing segments are simplified to linear at the boundary;
 * non-crossing segments keep their interpolation.
 */
export function splitSpeedCurveAtFraction({
	curve,
	fraction,
}: {
	curve: SpeedCurveKeyframe[];
	fraction: number;
}): {
	left: SpeedCurveKeyframe[];
	right: SpeedCurveKeyframe[];
} {
	const keys = normalizeSpeedCurve({ curve });
	const f = clamp01({ value: fraction });
	if (keys.length === 0) {
		return { left: [], right: [] };
	}

	const boundaryRate = getSpeedRateAt({ curve: keys, time: f });
	const boundaryId = `split-${f}`;

	const leftKeys = keys
		.filter((key) => key.time < f)
		.map((key) => scaleKeyframeTime({ key, scale: 1 / f, offset: 0 }));
	const leftBoundary: SpeedCurveKeyframe = {
		id: boundaryId,
		time: 1,
		rate: boundaryRate,
		segmentToNext: "linear",
	};
	if (leftKeys.length > 0) {
		leftKeys[leftKeys.length - 1] = {
			...leftKeys[leftKeys.length - 1],
			segmentToNext: "linear",
			rightHandle: undefined,
		};
	}

	const rightKeys = keys
		.filter((key) => key.time > f)
		.map((key) => scaleKeyframeTime({ key, scale: 1 / (1 - f), offset: -f / (1 - f) }));
	const rightBoundary: SpeedCurveKeyframe = {
		id: boundaryId,
		time: 0,
		rate: boundaryRate,
		segmentToNext: "linear",
	};

	return {
		left: f > 0 ? [...leftKeys, leftBoundary] : leftKeys,
		right: f < 1 ? [rightBoundary, ...rightKeys] : rightKeys,
	};
}
