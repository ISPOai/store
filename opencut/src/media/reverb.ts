// Convolution reverb, synthesized locally: there is no impulse-response asset in
// the repo and no network, so the IR is generated deterministically from its
// parameters. The same decay always produces the same room, which keeps exports
// reproducible and lets both the playback graph and the export mixdown share one
// send bus per distinct decay.

export const REVERB_WET_MIN = 0;
export const REVERB_WET_MAX = 1;
export const REVERB_WET_DEFAULT = 0;
export const REVERB_DECAY_MIN_SECONDS = 0.1;
export const REVERB_DECAY_MAX_SECONDS = 10;
export const REVERB_DECAY_DEFAULT_SECONDS = 1.8;

const REVERB_PREDELAY_SECONDS = 0.012;
// One-pole lowpass coefficient applied to the tail: lower is a darker room.
const REVERB_DAMPING_COEFFICIENT = 0.42;
// Early reflections as discrete taps (seconds, amplitude), scaled by decay.
const EARLY_REFLECTIONS: Array<[number, number]> = [
	[0.007, 0.72],
	[0.013, 0.56],
	[0.021, 0.44],
	[0.034, 0.32],
	[0.049, 0.24],
	[0.068, 0.17],
];
const DECAY_QUANTIZATION_STEP_SECONDS = 0.05;

export interface ElementReverb {
	wet: number;
	decaySeconds: number;
}

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function clampReverbWet(value: number): number {
	if (!Number.isFinite(value)) return REVERB_WET_DEFAULT;
	return Math.min(REVERB_WET_MAX, Math.max(REVERB_WET_MIN, value));
}

// Bucketing the decay is what makes one convolution serve many clips: clips that
// asked for "the same room" within 50ms share a send bus instead of each paying
// for its own convolution pass.
export function quantizeReverbDecay(decaySeconds: number): number {
	const value = Number.isFinite(decaySeconds)
		? decaySeconds
		: REVERB_DECAY_DEFAULT_SECONDS;
	const clamped = Math.min(
		REVERB_DECAY_MAX_SECONDS,
		Math.max(REVERB_DECAY_MIN_SECONDS, value),
	);
	return (
		Math.round(clamped / DECAY_QUANTIZATION_STEP_SECONDS) *
		DECAY_QUANTIZATION_STEP_SECONDS
	);
}

export function createImpulseResponse({
	audioContext,
	decaySeconds,
}: {
	audioContext: BaseAudioContext;
	decaySeconds: number;
}): AudioBuffer {
	const decay = quantizeReverbDecay(decaySeconds);
	const sampleRate = audioContext.sampleRate;
	const preDelaySamples = Math.round(REVERB_PREDELAY_SECONDS * sampleRate);
	const length = Math.max(
		1,
		preDelaySamples + Math.ceil(decay * sampleRate),
	);
	const buffer = audioContext.createBuffer(2, length, sampleRate);

	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		// Seed from the decay and channel index so the two channels decorrelate
		// (a stereo room) while the render stays deterministic.
		const random = mulberry32(
			Math.round(decay * 1000) * 7919 + channel * 104729 + 1,
		);
		let lowpassState = 0;

		for (let index = preDelaySamples; index < length; index++) {
			const tailTime = (index - preDelaySamples) / sampleRate;
			// -60dB at the end of the decay window.
			const envelope = 10 ** ((-60 * (tailTime / decay)) / 20);
			const noise = random() * 2 - 1;
			lowpassState += REVERB_DAMPING_COEFFICIENT * (noise - lowpassState);
			data[index] = lowpassState * envelope;
		}

		for (const [delaySeconds, amplitude] of EARLY_REFLECTIONS) {
			const index =
				preDelaySamples + Math.round(delaySeconds * sampleRate * (1 + channel * 0.13));
			if (index >= length) continue;
			data[index] += amplitude * (channel === 0 ? 1 : -1);
		}
	}

	return buffer;
}

// Renders one whole send bus through a single convolution. Used by the export
// mixdown; playback uses a live ConvolverNode on the same IR.
export async function renderReverbSend({
	buffer,
	decaySeconds,
}: {
	buffer: AudioBuffer;
	decaySeconds: number;
}): Promise<AudioBuffer> {
	const offlineContext = new OfflineAudioContext(
		buffer.numberOfChannels,
		Math.max(1, buffer.length),
		buffer.sampleRate,
	);
	const source = offlineContext.createBufferSource();
	source.buffer = buffer;
	const convolver = offlineContext.createConvolver();
	convolver.normalize = true;
	convolver.buffer = createImpulseResponse({
		audioContext: offlineContext,
		decaySeconds,
	});
	source.connect(convolver);
	convolver.connect(offlineContext.destination);
	source.start(0);
	return await offlineContext.startRendering();
}
