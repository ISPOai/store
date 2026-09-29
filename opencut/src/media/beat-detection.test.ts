import { expect, test } from "bun:test";
import {
	detectBeats,
	isBeatAnalysisUsable,
	mixdownAndDecimate,
} from "./beat-detection";

const RATE = 44100;

function clickTrack({ bpm, seconds, offset }: { bpm: number; seconds: number; offset: number }) {
	const data = new Float32Array(seconds * RATE);
	const period = 60 / bpm;
	for (let beat = 0; offset + beat * period < seconds; beat++) {
		const start = Math.floor((offset + beat * period) * RATE);
		const gain = beat % 4 === 0 ? 1 : 0.5;
		for (let i = 0; i < 400 && start + i < data.length; i++) {
			data[start + i] = Math.sin(i * 0.3) * Math.exp(-i / 80) * gain;
		}
	}
	return mixdownAndDecimate({ channels: [data], sampleRate: RATE });
}

test("recovers tempo, beat positions and bar phase from a click track", () => {
	for (const bpm of [90, 128]) {
		const analysis = detectBeats(clickTrack({ bpm, seconds: 20, offset: 0.3 }));
		expect(Math.abs(analysis.bpm - bpm)).toBeLessThan(1.5);
		expect(isBeatAnalysisUsable(analysis)).toBe(true);
		const period = 60 / bpm;
		for (const time of analysis.beats.slice(2, -2)) {
			const phase = (time - 0.3) / period;
			expect(Math.abs(phase - Math.round(phase)) * period).toBeLessThan(0.03);
		}
		const firstDownbeat = analysis.beats[analysis.downbeatOffset];
		const bar = (firstDownbeat - 0.3) / (period * 4);
		expect(Math.abs(bar - Math.round(bar)) * period * 4).toBeLessThan(0.03);
	}
});

test("noise has no usable pulse", () => {
	let seed = 1;
	const data = new Float32Array(20 * RATE).map(() => {
		seed = (seed * 16807) % 2147483647;
		return seed / 2147483647 - 0.5;
	});
	const analysis = detectBeats(
		mixdownAndDecimate({ channels: [data], sampleRate: RATE }),
	);
	expect(isBeatAnalysisUsable(analysis)).toBe(false);
});
