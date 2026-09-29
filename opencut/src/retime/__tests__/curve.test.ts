import { describe, expect, test } from "bun:test";
import {
	getClipTimeAtSourceTime,
	getEffectiveRateAt,
	getSourceTimeAtClipTime,
	getTimelineDurationForSourceSpan,
	getSpeedCurveAverageRate,
	getSpeedRateAt,
	integrateSpeedCurve,
	splitSpeedCurveAtFraction,
} from "@/retime";
import {
	SPEED_CURVE_PRESET_NAMES,
	buildSpeedCurvePreset,
} from "@/retime/presets";
import type { RetimeConfig, SpeedCurveKeyframe } from "@/timeline";

function linearCurve({
	startRate,
	endRate,
}: {
	startRate: number;
	endRate: number;
}): SpeedCurveKeyframe[] {
	return [
		{ id: "a", time: 0, rate: startRate, segmentToNext: "linear" },
		{ id: "b", time: 1, rate: endRate, segmentToNext: "linear" },
	];
}

function retimeWithCurve(curve: SpeedCurveKeyframe[]): RetimeConfig {
	return { rate: 1, curve };
}

describe("speed curve resolve", () => {
	test("maps clip time to source time by integrating the rate curve", () => {
		const curve = linearCurve({ startRate: 1, endRate: 3 });
		const retime = retimeWithCurve(curve);
		// rate(u) = 1 + 2u; integral to u=0.5 is 0.75, scaled by clipDuration=10.
		expect(
			getSourceTimeAtClipTime({ clipTime: 5, clipDuration: 10, retime }),
		).toBe(7.5);
	});

	test("falls back to constant rate when no curve is present", () => {
		expect(getSourceTimeAtClipTime({ clipTime: 5, retime: { rate: 2 } })).toBe(
			10,
		);
	});

	test("inverts source time back to clip time across a curve", () => {
		const curve = linearCurve({ startRate: 1, endRate: 3 });
		const retime = retimeWithCurve(curve);
		const clipTime = getClipTimeAtSourceTime({
			sourceTime: 7.5,
			clipDuration: 10,
			retime,
		});
		expect(clipTime).toBeCloseTo(5, 6);
	});

	test("derives timeline duration from the average curve rate", () => {
		const curve = linearCurve({ startRate: 1, endRate: 3 });
		const retime = retimeWithCurve(curve);
		expect(getTimelineDurationForSourceSpan({ sourceSpan: 10, retime })).toBe(5);
	});

	test("reports the effective rate at a clip position", () => {
		const curve = linearCurve({ startRate: 1, endRate: 3 });
		const retime = retimeWithCurve(curve);
		expect(
			getEffectiveRateAt({ retime, clipTime: 5, clipDuration: 10 }),
		).toBe(2);
		expect(getEffectiveRateAt({ retime })).toBeCloseTo(2, 6);
	});

	test("averages a step curve as a piecewise hold", () => {
		const curve: SpeedCurveKeyframe[] = [
			{ id: "a", time: 0, rate: 2, segmentToNext: "step" },
			{ id: "b", time: 0.5, rate: 4, segmentToNext: "step" },
			{ id: "c", time: 1, rate: 1, segmentToNext: "step" },
		];
		// 2 * 0.5 + 4 * 0.5 = 3
		expect(getSpeedCurveAverageRate({ curve })).toBe(3);
	});
});

describe("speed curve helpers", () => {
	test("integrates a linear ramp analytically", () => {
		const curve = linearCurve({ startRate: 1, endRate: 5 });
		// rate(u) = 1 + 4u; integral over [0,1] is 3, over [0,0.5] is 1.
		expect(integrateSpeedCurve({ curve, to: 1 })).toBeCloseTo(3, 6);
		expect(integrateSpeedCurve({ curve, to: 0.5 })).toBeCloseTo(1, 6);
	});

	test("samples a bezier segment without throwing and stays bounded", () => {
		const curve: SpeedCurveKeyframe[] = [
			{
				id: "a",
				time: 0,
				rate: 1,
				segmentToNext: "bezier",
				rightHandle: { dt: 0.1, dv: 0.4 },
			},
			{
				id: "b",
				time: 1,
				rate: 2,
				segmentToNext: "bezier",
				leftHandle: { dt: -0.1, dv: -0.4 },
			},
		];
		const mid = getSpeedRateAt({ curve, time: 0.5 });
		expect(Number.isFinite(mid)).toBe(true);
		expect(mid).toBeGreaterThan(0.5);
		expect(mid).toBeLessThan(3);
	});

	test("splits a curve at a fraction and preserves accumulated source time", () => {
		const curve = linearCurve({ startRate: 1, endRate: 3 });
		const { left, right } = splitSpeedCurveAtFraction({ curve, fraction: 0.5 });
		const leftAverage = integrateSpeedCurve({ curve: left, to: 1 });
		const rightAverage = integrateSpeedCurve({ curve: right, to: 1 });
		// Re-normalized averages, weighted by their fraction of the clip, sum to
		// the original accumulated source fraction (0.75 + 1.25 = 2).
		expect(leftAverage * 0.5).toBeCloseTo(0.75, 6);
		expect(rightAverage * 0.5).toBeCloseTo(1.25, 6);
	});
});

describe("speed curve presets", () => {
	test("exposes exactly the six CapCut-style presets", () => {
		expect(SPEED_CURVE_PRESET_NAMES).toEqual([
			"montage",
			"hero",
			"bullet",
			"jump-cut",
			"flash-in",
			"flash-out",
		]);
	});

	test("every preset spans the full clip and keeps rates positive", () => {
		for (const name of SPEED_CURVE_PRESET_NAMES) {
			const retime = buildSpeedCurvePreset({ name });
			expect(retime.curve).toBeDefined();
			const curve = retime.curve ?? [];
			expect(curve.length).toBeGreaterThanOrEqual(2);
			expect(curve[0].time).toBe(0);
			expect(curve[curve.length - 1].time).toBe(1);
			for (const key of curve) {
				expect(key.rate).toBeGreaterThan(0);
			}
		}
	});
});
