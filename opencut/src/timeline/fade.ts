/**
 * Pure fade-envelope math for clip audio fades.
 *
 * A fade-in ramps the clip's linear gain from silence (0) to full (1) across
 * the first `fadeInSeconds` of the clip; a fade-out ramps it back to silence
 * across the last `fadeOutSeconds`. Both are applied multiplicatively on top of
 * the clip's resolved volume (and any volume keyframes), so the envelope never
 * depends on the base gain.
 */

export function computeFadeEnvelope({
	fadeInSeconds,
	fadeOutSeconds,
	durationSeconds,
	localTime,
}: {
	fadeInSeconds: number;
	fadeOutSeconds: number;
	durationSeconds: number;
	localTime: number;
}): number {
	const safeFadeIn = Number.isFinite(fadeInSeconds) ? Math.max(0, fadeInSeconds) : 0;
	const safeFadeOut = Number.isFinite(fadeOutSeconds) ? Math.max(0, fadeOutSeconds) : 0;
	if (safeFadeIn <= 0 && safeFadeOut <= 0) {
		return 1;
	}

	const safeDuration = Number.isFinite(durationSeconds) ? durationSeconds : 0;
	if (safeDuration <= 0) {
		return 1;
	}

	let envelope = 1;
	const fadeInEnd = Math.min(safeFadeIn, safeDuration);
	if (safeFadeIn > 0 && localTime < fadeInEnd) {
		envelope *= fadeInEnd > 0 ? localTime / fadeInEnd : 0;
	}

	const fadeOutStart = Math.max(0, safeDuration - safeFadeOut);
	if (safeFadeOut > 0 && localTime > fadeOutStart) {
		const remaining = safeDuration - fadeOutStart;
		envelope *= remaining > 0 ? (safeDuration - localTime) / remaining : 0;
	}

	return envelope;
}
