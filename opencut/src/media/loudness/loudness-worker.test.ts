import { describe, expect, test } from "bun:test";
import { measureLoudness } from "./r128";

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

describe("loudness worker parity", () => {
	test("worker measureLoudness matches the TypeScript implementation", async () => {
		const workerModule = (await import("../../../public/loudness-worker.js")) as {
			measureLoudness: (args: {
				channels: Float32Array[];
				sampleRate: number;
			}) => { integratedLufs: number; samplePeakDb: number };
		};

		const cases: Array<{ sampleRate: number; amplitude: number; duration: number }> = [
			{ sampleRate: 44100, amplitude: 1, duration: 2 },
			{ sampleRate: 48000, amplitude: 0.4, duration: 3 },
			{ sampleRate: 48000, amplitude: 0.9, duration: 5 },
		];

		for (const entry of cases) {
			const channels = [
				sine({ sampleRate: entry.sampleRate, frequency: 997, amplitude: entry.amplitude, duration: entry.duration }),
			];
			const expected = measureLoudness({ channels, sampleRate: entry.sampleRate });
			const actual = workerModule.measureLoudness({ channels, sampleRate: entry.sampleRate });
			expect(actual.integratedLufs).toBeCloseTo(expected.integratedLufs, 4);
			expect(actual.samplePeakDb).toBeCloseTo(expected.samplePeakDb, 4);
		}
	});
});
