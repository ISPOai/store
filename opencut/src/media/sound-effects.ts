export const SOUND_EFFECT_KINDS = [
	"whoosh",
	"swoosh",
	"riser",
	"pop",
	"crack",
	"click",
	"ding",
	"boom",
] as const;
export type SoundEffectKind = (typeof SOUND_EFFECT_KINDS)[number];

const RATE = 48000;
const TAU = Math.PI * 2;

export interface SoundEffectOptions {
	seconds?: number;
	seed?: number;
}

export function defaultSoundEffectDuration(kind: SoundEffectKind): number {
	switch (kind) {
		case "click":
			return 0.05;
		case "crack":
			return 0.12;
		case "pop":
			return 0.2;
		case "swoosh":
			return 0.6;
		case "whoosh":
			return 0.9;
		case "boom":
			return 1.3;
		case "ding":
			return 1.6;
		case "riser":
			return 2.0;
	}
}

export function defaultSoundEffectGain(kind: SoundEffectKind): number {
	switch (kind) {
		case "boom":
			return 0.85;
		case "whoosh":
		case "swoosh":
		case "riser":
			return 0.7;
		default:
			return 0.8;
	}
}

export function validateSoundEffect(
	kind: SoundEffectKind,
	seconds?: number,
	seed?: number,
) {
	if (!SOUND_EFFECT_KINDS.includes(kind)) throw new Error("Unknown sound effect kind.");
	if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0.03 || seconds > 30))
		throw new Error("Sound effect duration must be 0.03–30 seconds.");
	if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))
		throw new Error("Invalid sound effect seed.");
}

function makeNoise(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2147483648 - 1;
	};
}

interface SvfState {
	ic1: number;
	ic2: number;
}

function svfBandpass(state: SvfState, x: number, freq: number, q: number): number {
	const g = Math.tan((Math.PI * freq) / RATE);
	const k = 1 / q;
	const a1 = 1 / (1 + g * (g + k));
	const a2 = g * a1;
	const a3 = g * a2;
	const v3 = x - state.ic2;
	const v1 = a1 * state.ic1 + a2 * v3;
	const v2 = state.ic2 + a2 * state.ic1 + a3 * v3;
	state.ic1 = 2 * v1 - state.ic1;
	state.ic2 = 2 * v2 - state.ic2;
	return v1;
}

function click(samples: Float32Array, noise: () => number) {
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		samples[i] =
			Math.sin(TAU * 3000 * t) * Math.exp(-t * 260) * 0.6 +
			Math.sin(TAU * 1100 * t) * Math.exp(-t * 120) * 0.4 +
			noise() * Math.exp(-t * 600) * 0.15;
	}
}

function crack(samples: Float32Array, noise: () => number) {
	let lp = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		const n = noise();
		lp += 0.25 * (n - lp);
		samples[i] = (n - lp) * Math.exp(-t * 45) * 1.3 + n * Math.exp(-t * 200) * 0.3;
	}
}

function pop(samples: Float32Array, noise: () => number) {
	let phase = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		const freq = 90 + 510 * Math.exp(-t * 30);
		phase += (TAU * freq) / RATE;
		samples[i] =
			Math.sin(phase) * Math.exp(-t * 18) * 0.8 + noise() * Math.exp(-t * 300) * 0.3;
	}
}

function sweep(
	samples: Float32Array,
	noise: () => number,
	startHz: number,
	endHz: number,
	q: number,
	attack: number,
	decay: number,
) {
	const duration = samples.length / RATE;
	const state: SvfState = { ic1: 0, ic2: 0 };
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		const ratio = Math.min(1, t / duration);
		const freq = startHz * Math.pow(endHz / startHz, ratio);
		const band = svfBandpass(state, noise(), freq, q);
		const env = Math.min(1, t / attack) * Math.exp(-Math.max(0, t - attack) / decay);
		samples[i] = band * env;
	}
}

function swoosh(samples: Float32Array, noise: () => number, deep: boolean) {
	if (deep) {
		sweep(samples, noise, 2600, 240, 1.1, 0.1, 0.28);
	} else {
		sweep(samples, noise, 3800, 420, 1.3, 0.06, 0.14);
	}
}

function riser(samples: Float32Array, noise: () => number) {
	const duration = samples.length / RATE;
	const state: SvfState = { ic1: 0, ic2: 0 };
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		const ratio = Math.min(1, t / duration);
		const freq = 420 * Math.pow(6200 / 420, ratio);
		const band = svfBandpass(state, noise(), freq, 1.4);
		const ramp = Math.pow(Math.min(1, t / (duration - 0.05)), 2);
		const release = Math.min(1, (duration - t) / 0.05);
		samples[i] = band * ramp * release * 1.2;
	}
}

function boom(samples: Float32Array, noise: () => number) {
	let phase = 0;
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		const freq = 42 + 52 * Math.exp(-t * 9);
		phase += (TAU * freq) / RATE;
		samples[i] =
			Math.sin(phase) * Math.exp(-t * 5) * 0.95 +
			Math.sin(TAU * 55 * t) * Math.exp(-t * 4.5) * 0.5 +
			noise() * Math.exp(-t * 28) * 0.45;
	}
}

function ding(samples: Float32Array) {
	const f0 = 1320;
	const partials: Array<[number, number, number]> = [
		[1, 1, 3.2],
		[2.0, 0.6, 5.5],
		[2.74, 0.4, 8.2],
		[4.07, 0.26, 11.5],
		[5.36, 0.16, 15],
		[8.1, 0.08, 20],
	];
	for (let i = 0; i < samples.length; i++) {
		const t = i / RATE;
		let s = 0;
		for (const [ratio, amp, decay] of partials) {
			s += Math.sin(TAU * f0 * ratio * t) * amp * Math.exp(-t * decay);
		}
		samples[i] = s * 0.9;
	}
}

function synthesize(kind: SoundEffectKind, seconds: number, seed: number): Float32Array {
	const samples = new Float32Array(Math.round(seconds * RATE));
	const noise = makeNoise(seed);
	switch (kind) {
		case "click":
			click(samples, noise);
			break;
		case "crack":
			crack(samples, noise);
			break;
		case "pop":
			pop(samples, noise);
			break;
		case "swoosh":
			swoosh(samples, noise, false);
			break;
		case "whoosh":
			swoosh(samples, noise, true);
			break;
		case "riser":
			riser(samples, noise);
			break;
		case "boom":
			boom(samples, noise);
			break;
		case "ding":
			ding(samples);
			break;
	}
	return samples;
}

function encodeMonoWav(samples: Float32Array, gain: number): Uint8Array<ArrayBuffer> {
	let peak = 0;
	for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
	const count = samples.length;
	const bytes = new Uint8Array(44 + count * 2);
	const view = new DataView(bytes.buffer);
	const tag = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	tag(0, "RIFF");
	view.setUint32(4, bytes.length - 8, true);
	tag(8, "WAVE");
	tag(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, RATE, true);
	view.setUint32(28, RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	tag(36, "data");
	view.setUint32(40, count * 2, true);
	const scale = gain / Math.max(peak, 0.001);
	for (let i = 0; i < count; i++) {
		const v = Math.max(-1, Math.min(1, samples[i] * scale));
		view.setInt16(44 + i * 2, Math.round(v * 32767), true);
	}
	return bytes;
}

export function soundEffectWav(
	kind: SoundEffectKind,
	options: SoundEffectOptions = {},
): { bytes: Uint8Array<ArrayBuffer>; seconds: number } {
	const seconds = options.seconds ?? defaultSoundEffectDuration(kind);
	const seed = options.seed ?? 113;
	validateSoundEffect(kind, seconds, seed);
	const samples = synthesize(kind, seconds, seed);
	const bytes = encodeMonoWav(samples, defaultSoundEffectGain(kind));
	return { bytes, seconds };
}

export async function soundEffectDigest(bytes: Uint8Array) {
	return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
}

export function verifySoundEffectWav(bytes: Uint8Array, seconds: number) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const tag = (offset: number) => String.fromCharCode(...bytes.slice(offset, offset + 4));
	if (
		bytes.length !== 44 + Math.round(seconds * RATE) * 2 ||
		tag(0) !== "RIFF" ||
		tag(8) !== "WAVE" ||
		tag(36) !== "data" ||
		view.getUint32(4, true) !== bytes.length - 8 ||
		view.getUint32(40, true) !== bytes.length - 44 ||
		view.getUint16(20, true) !== 1 ||
		view.getUint16(22, true) !== 1 ||
		view.getUint32(24, true) !== RATE ||
		view.getUint16(34, true) !== 16
	)
		throw new Error("Published sound effect WAV format verification failed.");
	let energy = 0;
	let peak = 0;
	for (let i = 44; i < bytes.length; i += 2) {
		const x = view.getInt16(i, true) / 32768;
		energy += x * x;
		peak = Math.max(peak, Math.abs(x));
	}
	const rms = Math.sqrt(energy / ((bytes.length - 44) / 2));
	if (rms < 0.01 || peak >= 0.99) throw new Error("Sound effect is silent or clipped.");
	return { sampleRate: RATE, channels: 1, bitsPerSample: 16, rms, peak };
}
