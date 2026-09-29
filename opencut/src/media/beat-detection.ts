/**
 * Offline beat tracking for the timeline beat grid.
 *
 * Pipeline (after Ellis 2007, "Beat Tracking by Dynamic Programming"):
 * 1. mono mixdown + decimate to ~11 kHz
 * 2. log-magnitude spectral flux → onset strength envelope (plus a bass-band
 *    envelope used to pick the downbeat phase)
 * 3. tempo from the tempo-weighted autocorrelation of the envelope
 * 4. dynamic programming picks the beat sequence that best balances onset
 *    strength against steady inter-beat spacing
 *
 * All times are source-media seconds.
 */

const TARGET_RATE = 11025;
const FRAME_SIZE = 512;
const HOP_SIZE = 128;
const BASS_CUTOFF_HZ = 150;
const MIN_BPM = 60;
const MAX_BPM = 190;
const PREFERRED_BPM = 120;
const TEMPO_OCTAVE_WIDTH = 1;
const TIGHTNESS = 100;
const BEATS_PER_BAR = 4;
/** Below this the signal has no steady pulse (speech, ambience) and no grid is shown. */
export const MIN_BEAT_CONFIDENCE = 0.25;

export interface BeatAnalysis {
	bpm: number;
	/** Beat times in source seconds, ascending. */
	beats: number[];
	/** Index into `beats` of the first downbeat (bar start). */
	downbeatOffset: number;
	/** 0..1 periodicity strength; below MIN_BEAT_CONFIDENCE the pulse is unreliable. */
	confidence: number;
}

export interface MonoSignal {
	samples: Float32Array;
	sampleRate: number;
}

export function mixdownAndDecimate({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): MonoSignal {
	const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
	const length = channels[0]?.length ?? 0;
	const out = new Float32Array(Math.floor(length / factor));
	const scale = 1 / (factor * Math.max(1, channels.length));
	for (let i = 0; i < out.length; i++) {
		let sum = 0;
		const start = i * factor;
		for (const data of channels) {
			for (let j = 0; j < factor; j++) sum += data[start + j];
		}
		out[i] = sum * scale;
	}
	return { samples: out, sampleRate: sampleRate / factor };
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const angle = (-2 * Math.PI) / len;
		const wRe = Math.cos(angle);
		const wIm = Math.sin(angle);
		for (let i = 0; i < n; i += len) {
			let curRe = 1;
			let curIm = 0;
			for (let k = 0; k < len / 2; k++) {
				const aRe = re[i + k];
				const aIm = im[i + k];
				const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
				const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
				re[i + k] = aRe + bRe;
				im[i + k] = aIm + bIm;
				re[i + k + len / 2] = aRe - bRe;
				im[i + k + len / 2] = aIm - bIm;
				const nextRe = curRe * wRe - curIm * wIm;
				curIm = curRe * wIm + curIm * wRe;
				curRe = nextRe;
			}
		}
	}
}

function onsetEnvelopes({ samples, sampleRate }: MonoSignal): {
	full: Float64Array;
	bass: Float64Array;
} {
	const frameCount = Math.max(
		0,
		Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1,
	);
	const bins = FRAME_SIZE / 2;
	const bassBins = Math.max(
		2,
		Math.round((BASS_CUTOFF_HZ / sampleRate) * FRAME_SIZE),
	);
	const window = new Float64Array(FRAME_SIZE);
	for (let i = 0; i < FRAME_SIZE; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME_SIZE);
	}
	const full = new Float64Array(frameCount);
	const bass = new Float64Array(frameCount);
	const re = new Float64Array(FRAME_SIZE);
	const im = new Float64Array(FRAME_SIZE);
	let previous = new Float64Array(bins);
	let current = new Float64Array(bins);

	for (let frame = 0; frame < frameCount; frame++) {
		const offset = frame * HOP_SIZE;
		for (let i = 0; i < FRAME_SIZE; i++) {
			re[i] = samples[offset + i] * window[i];
			im[i] = 0;
		}
		fftInPlace(re, im);
		let flux = 0;
		let bassFlux = 0;
		for (let k = 1; k < bins; k++) {
			current[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
			const rise = current[k] - previous[k];
			if (rise > 0) {
				flux += rise;
				if (k < bassBins) bassFlux += rise;
			}
		}
		if (frame > 0) {
			full[frame] = flux;
			bass[frame] = bassFlux;
		}
		[previous, current] = [current, previous];
	}

	return { full: normalizeEnvelope(full), bass: normalizeEnvelope(bass) };
}

/** Remove the slow-moving loudness trend so only transients remain, then unit-scale. */
function normalizeEnvelope(env: Float64Array): Float64Array {
	const radius = 16;
	const out = new Float64Array(env.length);
	let sum = 0;
	let count = 0;
	for (let i = 0; i < Math.min(env.length, radius); i++) {
		sum += env[i];
		count++;
	}
	for (let i = 0; i < env.length; i++) {
		const add = i + radius;
		if (add < env.length) {
			sum += env[add];
			count++;
		}
		const drop = i - radius - 1;
		if (drop >= 0) {
			sum -= env[drop];
			count--;
		}
		out[i] = Math.max(0, env[i] - sum / count);
	}
	let sq = 0;
	for (const v of out) sq += v * v;
	const std = Math.sqrt(sq / Math.max(1, out.length)) || 1;
	for (let i = 0; i < out.length; i++) out[i] /= std;
	return out;
}

function estimatePeriod({
	env,
	framesPerSecond,
}: {
	env: Float64Array;
	framesPerSecond: number;
}): { period: number; confidence: number } {
	const minLag = Math.floor((60 / MAX_BPM) * framesPerSecond);
	const maxLag = Math.ceil((60 / MIN_BPM) * framesPerSecond);
	const preferredLag = (60 / PREFERRED_BPM) * framesPerSecond;
	const n = env.length;
	// Autocorrelate the zero-mean envelope; the half-wave rectified mean would
	// otherwise read as periodicity at every lag.
	let mean = 0;
	for (let i = 0; i < n; i++) mean += env[i];
	mean /= Math.max(1, n);
	const centered = env.map((v) => v - mean);
	let zeroLag = 0;
	for (let i = 0; i < n; i++) zeroLag += centered[i] * centered[i];
	if (zeroLag <= 0 || n <= maxLag * 2) return { period: 0, confidence: 0 };

	const raw = new Float64Array(maxLag + 2);
	for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
		let sum = 0;
		for (let i = lag; i < n; i++) sum += centered[i] * centered[i - lag];
		raw[lag] = sum / (n - lag);
	}

	let bestLag = minLag;
	let bestScore = -Infinity;
	for (let lag = minLag; lag <= maxLag; lag++) {
		const octaves = Math.log2(lag / preferredLag) / TEMPO_OCTAVE_WIDTH;
		const score = raw[lag] * Math.exp(-0.5 * octaves * octaves);
		if (score > bestScore) {
			bestScore = score;
			bestLag = lag;
		}
	}

	// Parabolic refinement for a fractional period.
	const a = raw[bestLag - 1];
	const b = raw[bestLag];
	const c = raw[bestLag + 1];
	const denom = a - 2 * b + c;
	const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
	const confidence = Math.max(0, Math.min(1, b / (zeroLag / n)));
	return { period: bestLag + shift, confidence };
}

function trackBeats({
	env,
	period,
}: {
	env: Float64Array;
	period: number;
}): number[] {
	const n = env.length;
	const score = new Float64Array(n);
	const backlink = new Int32Array(n).fill(-1);
	const minBack = Math.max(1, Math.round(period / 2));
	const maxBack = Math.round(period * 2);

	for (let t = 0; t < n; t++) {
		let best = 0;
		let bestPrev = -1;
		for (let p = t - maxBack; p <= t - minBack; p++) {
			if (p < 0) continue;
			const deviation = Math.log((t - p) / period);
			const candidate = score[p] - TIGHTNESS * deviation * deviation;
			if (bestPrev < 0 || candidate > best) {
				best = candidate;
				bestPrev = p;
			}
		}
		if (bestPrev >= 0 && best > 0) {
			score[t] = env[t] + best;
			backlink[t] = bestPrev;
		} else {
			score[t] = env[t];
		}
	}

	// Start the backtrace at the strongest local max within the final period.
	let end = n - 1;
	for (let t = Math.max(0, n - Math.ceil(period)); t < n; t++) {
		if (score[t] > score[end]) end = t;
	}
	const beats: number[] = [];
	for (let t = end; t >= 0; t = backlink[t]) {
		beats.push(t);
		if (backlink[t] < 0) break;
	}
	beats.reverse();

	// The chain can start late if the intro is quiet; extend at the tempo back to 0.
	const first = beats[0];
	if (first != null) {
		const lead: number[] = [];
		for (let t = first - period; t >= 0; t -= period) lead.unshift(Math.round(t));
		beats.unshift(...lead);
	}
	return beats;
}

function pickDownbeatOffset({
	beatFrames,
	bass,
	full,
}: {
	beatFrames: number[];
	bass: Float64Array;
	full: Float64Array;
}): number {
	const strength = (frame: number) => {
		let peak = 0;
		for (let t = frame - 2; t <= frame + 2; t++) {
			const v = (bass[t] ?? 0) * 2 + (full[t] ?? 0);
			if (v > peak) peak = v;
		}
		return peak;
	};
	let bestOffset = 0;
	let bestSum = -Infinity;
	for (let offset = 0; offset < BEATS_PER_BAR; offset++) {
		let sum = 0;
		let count = 0;
		for (let i = offset; i < beatFrames.length; i += BEATS_PER_BAR) {
			sum += strength(beatFrames[i]);
			count++;
		}
		const mean = count > 0 ? sum / count : 0;
		if (mean > bestSum) {
			bestSum = mean;
			bestOffset = offset;
		}
	}
	return bestOffset;
}

export function detectBeats(signal: MonoSignal): BeatAnalysis {
	const framesPerSecond = signal.sampleRate / HOP_SIZE;
	const { full, bass } = onsetEnvelopes(signal);
	const { period, confidence } = estimatePeriod({ env: full, framesPerSecond });
	if (period <= 0) {
		return { bpm: 0, beats: [], downbeatOffset: 0, confidence: 0 };
	}
	const beatFrames = trackBeats({ env: full, period });
	const frameToSeconds = (frame: number) =>
		(frame * HOP_SIZE + FRAME_SIZE / 2) / signal.sampleRate;
	return {
		bpm: (60 * framesPerSecond) / period,
		beats: beatFrames.map(frameToSeconds),
		downbeatOffset: pickDownbeatOffset({ beatFrames, bass, full }),
		confidence,
	};
}

export function detectBeatsInBuffer(buffer: AudioBuffer): BeatAnalysis {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
		buffer.getChannelData(c),
	);
	return detectBeats(
		mixdownAndDecimate({ channels, sampleRate: buffer.sampleRate }),
	);
}

export function isBeatAnalysisUsable(analysis: BeatAnalysis | null): boolean {
	return (
		analysis != null &&
		analysis.beats.length > 1 &&
		analysis.confidence >= MIN_BEAT_CONFIDENCE
	);
}
