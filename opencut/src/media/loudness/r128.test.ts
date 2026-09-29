import { describe, expect, test } from "bun:test";
import {
	computeVolumeOffsetDb,
	measureLoudness,
	SILENCE_LUFS,
} from "./r128";

function sine({ sampleRate, frequency, amplitude, duration }: {
	sampleRate: number;
	frequency: number;
	amplitude: number;
	duration: number;
}): Float32Array {
	const length = Math.round(sampleRate * duration);
	const samples = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
	}
	return samples;
}

describe("EBU R128 integrated loudness", () => {
	test("full-scale 997 Hz sine measures about -3.01 LUFS", () => {
		for (const sampleRate of [44100, 48000]) {
			const channels = [sine({ sampleRate, frequency: 997, amplitude: 1, duration: 3 })];
			const { integratedLufs } = measureLoudness({ channels, sampleRate });
			expect(integratedLufs).toBeCloseTo(-3.01, 1);
		}
	});

	test("half-amplitude sine measures about -9.03 LUFS", () => {
		const sampleRate = 48000;
		const channels = [sine({ sampleRate, frequency: 997, amplitude: 0.5, duration: 3 })];
		const { integratedLufs } = measureLoudness({ channels, sampleRate });
		expect(integratedLufs).toBeCloseTo(-9.03, 1);
	});

	test("measurement is consistent across sample rates", () => {
		const a = measureLoudness({
			channels: [sine({ sampleRate: 44100, frequency: 997, amplitude: 0.8, duration: 2 })],
			sampleRate: 44100,
		}).integratedLufs;
		const b = measureLoudness({
			channels: [sine({ sampleRate: 48000, frequency: 997, amplitude: 0.8, duration: 2 })],
			sampleRate: 48000,
		}).integratedLufs;
		expect(Math.abs(a - b)).toBeLessThan(0.1);
	});

	test("silence reports -Infinity loudness", () => {
		const channels = [new Float32Array(48000)];
		const { integratedLufs, samplePeakDb } = measureLoudness({ channels, sampleRate: 48000 });
		expect(integratedLufs).toBe(SILENCE_LUFS);
		expect(samplePeakDb).toBe(SILENCE_LUFS);
	});

	test("sample peak reports full-scale as 0 dBFS", () => {
		const channels = [sine({ sampleRate: 48000, frequency: 997, amplitude: 1, duration: 1 })];
		const { samplePeakDb } = measureLoudness({ channels, sampleRate: 48000 });
		expect(samplePeakDb).toBeCloseTo(0, 3);
	});

	test("gating excludes a quiet middle passage", () => {
		const sampleRate = 48000;
		const loud = sine({ sampleRate, frequency: 997, amplitude: 1, duration: 4 });
		const quiet = sine({ sampleRate, frequency: 997, amplitude: 0.01, duration: 3 });
		const combined = new Float32Array(loud.length + quiet.length + loud.length);
		combined.set(loud, 0);
		combined.set(quiet, loud.length);
		combined.set(loud, loud.length + quiet.length);
		// The quiet (-40 dBFS) middle is ~37 LU below the loud passages and is
		// gated out, so the integrated loudness recovers the loud level.
		const { integratedLufs } = measureLoudness({ channels: [combined], sampleRate });
		expect(integratedLufs).toBeCloseTo(-3.01, 0);
	});
});

describe("computeVolumeOffsetDb", () => {
	test("computes the gain needed to reach a target", () => {
		expect(computeVolumeOffsetDb({ measuredLufs: -20, targetLufs: -14 })).toBeCloseTo(6, 5);
		expect(computeVolumeOffsetDb({ measuredLufs: -8, targetLufs: -14 })).toBeCloseTo(-6, 5);
	});

	test("returns null for silence", () => {
		expect(computeVolumeOffsetDb({ measuredLufs: -Infinity, targetLufs: -14 })).toBeNull();
	});
});
