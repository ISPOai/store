// EBU R128 / ITU-R BS.1770-4 loudness measurement.
//
// Integrated loudness (LUFS) is computed from per-channel sample data using
// the standard K-weighting filter (a +4 dB high-shelf followed by the RLB
// high-pass) and the two-stage block gating described in BS.1770-4 annex 1.
// The filter coefficients are designed for an arbitrary sample rate via the
// bilinear transform, matching the widely used libebur128 / ffmpeg ebur128
// design so the same signal measures the same across rates.

export interface LoudnessMeasurement {
	/** Integrated loudness in LUFS. `-Infinity` for digital silence. */
	integratedLufs: number;
	/** True sample peak in dBFS. `-Infinity` for digital silence. */
	samplePeakDb: number;
}

export const SILENCE_LUFS = -Infinity;

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const BLOCK_DURATION_SECONDS = 0.4;
const BLOCK_STEP_SECONDS = 0.1;

// BS.1770-4 channel weights: L, R, C, LFE, Ls, Rs.
const CHANNEL_WEIGHTS = [1.0, 1.0, 1.0, 1.0, 1.41, 1.41];

interface BiquadCoeffs {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
}

function designHighShelf({ sampleRate }: { sampleRate: number }): BiquadCoeffs {
	const f0 = 1681.974450955533;
	const gainDb = 3.999843853973347;
	const q = 0.7071752369554196;

	const k = Math.tan((Math.PI * f0) / sampleRate);
	const vh = Math.pow(10, gainDb / 20);
	const vb = Math.pow(vh, 0.4996667741545416);

	const a0 = 1 + k / q + k * k;
	return {
		b0: (vh + (vb * k) / q + k * k) / a0,
		b1: (2 * (k * k - vh)) / a0,
		b2: (vh - (vb * k) / q + k * k) / a0,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0,
	};
}

function designHighPass({ sampleRate }: { sampleRate: number }): BiquadCoeffs {
	const f0 = 38.13547087602444;
	const q = 0.5003270373238773;

	const k = Math.tan((Math.PI * f0) / sampleRate);
	const a0 = 1 + k / q + k * k;
	return {
		b0: 1,
		b1: -2,
		b2: 1,
		a1: (2 * (k * k - 1)) / a0,
		a2: (1 - k / q + k * k) / a0,
	};
}

function applyBiquadCascade({
	input,
	shelf,
	highPass,
}: {
	input: Float32Array;
	shelf: BiquadCoeffs;
	highPass: BiquadCoeffs;
}): Float32Array {
	const n = input.length;
	const stage1 = new Float32Array(n);

	let x1 = 0;
	let x2 = 0;
	let y1 = 0;
	let y2 = 0;
	for (let i = 0; i < n; i++) {
		const x = input[i];
		const y =
			shelf.b0 * x +
			shelf.b1 * x1 +
			shelf.b2 * x2 -
			shelf.a1 * y1 -
			shelf.a2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		stage1[i] = y;
	}

	const output = new Float32Array(n);
	x1 = 0;
	x2 = 0;
	y1 = 0;
	y2 = 0;
	for (let i = 0; i < n; i++) {
		const x = stage1[i];
		const y =
			highPass.b0 * x +
			highPass.b1 * x1 +
			highPass.b2 * x2 -
			highPass.a1 * y1 -
			highPass.a2 * y2;
		x2 = x1;
		x1 = x;
		y2 = y1;
		y1 = y;
		output[i] = y;
	}

	return output;
}

function channelWeight({
	channelIndex,
	channelCount,
}: {
	channelIndex: number;
	channelCount: number;
}): number {
	if (channelCount <= 2) return 1;
	return CHANNEL_WEIGHTS[Math.min(channelIndex, CHANNEL_WEIGHTS.length - 1)] ?? 1;
}

function energyToLoudness({ energy }: { energy: number }): number {
	if (!(energy > 0)) return SILENCE_LUFS;
	return 10 * Math.log10(energy) - 0.691;
}

function meanSquare({ data, start, end }: { data: Float32Array; start: number; end: number }): number {
	let sum = 0;
	for (let i = start; i < end; i++) {
		const value = data[i];
		sum += value * value;
	}
	const length = end - start;
	return length > 0 ? sum / length : 0;
}

interface LoudnessBlock {
	energy: number;
	loudness: number;
}

function computeBlocks({
	weightedChannels,
	sampleRate,
}: {
	weightedChannels: Float32Array[];
	sampleRate: number;
}): LoudnessBlock[] {
	const channelCount = weightedChannels.length;
	const length = channelCount > 0 ? weightedChannels[0].length : 0;
	if (length === 0) return [];

	const blockSamples = Math.max(1, Math.round(BLOCK_DURATION_SECONDS * sampleRate));
	const stepSamples = Math.max(1, Math.round(BLOCK_STEP_SECONDS * sampleRate));
	const blocks: LoudnessBlock[] = [];

	for (let start = 0; start < length; start += stepSamples) {
		const end = Math.min(start + blockSamples, length);
		let energy = 0;
		for (let channel = 0; channel < channelCount; channel++) {
			const weight = channelWeight({ channelIndex: channel, channelCount });
			energy += weight * meanSquare({ data: weightedChannels[channel], start, end });
		}
		blocks.push({ energy, loudness: energyToLoudness({ energy }) });
		if (end >= length) break;
	}

	return blocks;
}

function meanBlockEnergy({ blocks }: { blocks: LoudnessBlock[] }): number {
	if (blocks.length === 0) return 0;
	let total = 0;
	for (const block of blocks) total += block.energy;
	return total / blocks.length;
}

function gatedLoudness({ blocks }: { blocks: LoudnessBlock[] }): number {
	let surviving = blocks.filter((block) => block.loudness > ABSOLUTE_GATE_LUFS);
	if (surviving.length === 0) return SILENCE_LUFS;

	const absoluteMean = meanBlockEnergy({ blocks: surviving });
	const relativeThreshold = energyToLoudness({ energy: absoluteMean }) + RELATIVE_GATE_LU;
	const relative = surviving.filter((block) => block.loudness >= relativeThreshold);

	const finalBlocks = relative.length > 0 ? relative : surviving;
	return energyToLoudness({ energy: meanBlockEnergy({ blocks: finalBlocks }) });
}

/**
 * Measure integrated loudness and sample peak across the supplied channels.
 * Channels must share a sample count; pass already-trimmed channel data so the
 * measurement reflects the audible region of the clip.
 */
export function measureLoudness({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): LoudnessMeasurement {
	if (channels.length === 0) {
		return { integratedLufs: SILENCE_LUFS, samplePeakDb: SILENCE_LUFS };
	}

	const shelf = designHighShelf({ sampleRate });
	const highPass = designHighPass({ sampleRate });
	const weighted = channels.map((channel) =>
		applyBiquadCascade({ input: channel, shelf, highPass }),
	);

	const blocks = computeBlocks({ weightedChannels: weighted, sampleRate });
	const integratedLufs =
		blocks.length > 0 ? gatedLoudness({ blocks }) : SILENCE_LUFS;

	return { integratedLufs, samplePeakDb: measureSamplePeakDb({ channels }) };
}

export function measureSamplePeakDb({ channels }: { channels: Float32Array[] }): number {
	let peak = 0;
	for (const channel of channels) {
		for (let i = 0; i < channel.length; i++) {
			const magnitude = Math.abs(channel[i]);
			if (magnitude > peak) peak = magnitude;
		}
	}
	if (!(peak > 0)) return SILENCE_LUFS;
	return 20 * Math.log10(peak);
}

/**
 * Gain (dB) to add to the element's current volume so its audible output hits
 * `targetLufs`. Returns `null` for digital silence, which cannot be normalized.
 */
export function computeVolumeOffsetDb({
	measuredLufs,
	targetLufs,
}: {
	measuredLufs: number;
	targetLufs: number;
}): number | null {
	if (!Number.isFinite(measuredLufs)) return null;
	return targetLufs - measuredLufs;
}
