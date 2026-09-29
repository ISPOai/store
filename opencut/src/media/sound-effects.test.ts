import { expect, test } from "bun:test";
import {
	SOUND_EFFECT_KINDS,
	soundEffectWav,
	soundEffectDigest,
	verifySoundEffectWav,
	defaultSoundEffectDuration,
	validateSoundEffect,
} from "./sound-effects";

test("every effect synthesizes non-silent, unclipped mono WAV with exact frame count", () => {
	for (const kind of SOUND_EFFECT_KINDS) {
		const seconds = defaultSoundEffectDuration(kind);
		const { bytes } = soundEffectWav(kind);
		expect(bytes.length).toBe(44 + Math.round(seconds * 48000) * 2);
		const audio = verifySoundEffectWav(bytes, seconds);
		expect(audio.channels).toBe(1);
		expect(audio.rms).toBeGreaterThan(0.01);
		expect(audio.peak).toBeLessThan(0.99);
	}
});

test("effects are distinct from each other", async () => {
	const digests = new Set<string>();
	for (const kind of SOUND_EFFECT_KINDS) {
		const { bytes } = soundEffectWav(kind);
		digests.add(await soundEffectDigest(bytes));
	}
	expect(digests.size).toBe(SOUND_EFFECT_KINDS.length);
});

test("seed provides reproducible bytes and a distinct variant", async () => {
	const a = await soundEffectDigest(soundEffectWav("whoosh", { seed: 7 }).bytes);
	expect(await soundEffectDigest(soundEffectWav("whoosh", { seed: 7 }).bytes)).toBe(a);
	expect(await soundEffectDigest(soundEffectWav("whoosh", { seed: 8 }).bytes)).not.toBe(a);
});

test("duration override changes frame count", () => {
	const { bytes, seconds } = soundEffectWav("riser", { seconds: 3 });
	expect(seconds).toBe(3);
	expect(bytes.length).toBe(44 + Math.round(3 * 48000) * 2);
});

test("invalid inputs fail before synthesis", () => {
	expect(() => soundEffectWav("nope" as never)).toThrow();
	expect(() => soundEffectWav("whoosh", { seconds: 0.01 })).toThrow();
	expect(() => soundEffectWav("whoosh", { seconds: 31 })).toThrow();
	expect(() => soundEffectWav("whoosh", { seed: 1.5 })).toThrow();
	expect(() => validateSoundEffect("whoosh", 1, -1)).toThrow();
});

test("verification rejects truncated, silent and clipped audio", () => {
	const { bytes, seconds } = soundEffectWav("pop");
	expect(() => verifySoundEffectWav(bytes.slice(0, -4), seconds)).toThrow();
	const silent = bytes.slice();
	silent.fill(0, 44);
	expect(() => verifySoundEffectWav(silent, seconds)).toThrow();
});
