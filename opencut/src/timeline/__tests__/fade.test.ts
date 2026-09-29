import { describe, expect, test } from "bun:test";
import { computeFadeEnvelope } from "@/timeline/fade";

describe("computeFadeEnvelope", () => {
	test("returns 1 when no fade is set", () => {
		expect(
			computeFadeEnvelope({
				fadeInSeconds: 0,
				fadeOutSeconds: 0,
				durationSeconds: 10,
				localTime: 5,
			}),
		).toBe(1);
	});

	test("ramps a fade-in linearly from silence to full", () => {
		const params = { fadeInSeconds: 2, fadeOutSeconds: 0, durationSeconds: 10 };
		expect(computeFadeEnvelope({ ...params, localTime: 0 })).toBe(0);
		expect(computeFadeEnvelope({ ...params, localTime: 1 })).toBeCloseTo(0.5);
		expect(computeFadeEnvelope({ ...params, localTime: 2 })).toBe(1);
		expect(computeFadeEnvelope({ ...params, localTime: 5 })).toBe(1);
	});

	test("ramps a fade-out linearly from full to silence", () => {
		const params = { fadeInSeconds: 0, fadeOutSeconds: 3, durationSeconds: 10 };
		expect(computeFadeEnvelope({ ...params, localTime: 0 })).toBe(1);
		expect(computeFadeEnvelope({ ...params, localTime: 7 })).toBe(1);
		expect(computeFadeEnvelope({ ...params, localTime: 8.5 })).toBeCloseTo(0.5);
		expect(computeFadeEnvelope({ ...params, localTime: 10 })).toBe(0);
	});

	test("composes fade-in and fade-out multiplicatively", () => {
		const params = { fadeInSeconds: 2, fadeOutSeconds: 2, durationSeconds: 10 };
		expect(computeFadeEnvelope({ ...params, localTime: 1 })).toBeCloseTo(0.5);
		expect(computeFadeEnvelope({ ...params, localTime: 5 })).toBe(1);
		expect(computeFadeEnvelope({ ...params, localTime: 9 })).toBeCloseTo(0.5);
	});

	test("clamps fades to the clip duration and stays at 0 past the edges", () => {
		expect(
			computeFadeEnvelope({
				fadeInSeconds: 99,
				fadeOutSeconds: 0,
				durationSeconds: 4,
				localTime: 2,
			}),
		).toBeCloseTo(0.5);
		expect(
			computeFadeEnvelope({
				fadeInSeconds: 0,
				fadeOutSeconds: 0,
				durationSeconds: 0,
				localTime: 0,
			}),
		).toBe(1);
	});
});
