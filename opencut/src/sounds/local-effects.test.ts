import { expect, test } from "bun:test";
import { SOUND_EFFECT_KINDS } from "@/media/sound-effects";
import {
	LOCAL_SOUND_EFFECTS,
	localSoundEffectById,
	localSoundEffectByKind,
	isLocalSoundEffectKind,
} from "./local-effects";

test("catalog covers every synthesized effect exactly once", () => {
	expect(LOCAL_SOUND_EFFECTS).toHaveLength(SOUND_EFFECT_KINDS.length);
	const kinds = LOCAL_SOUND_EFFECTS.map((effect) => effect.kind).sort();
	expect(kinds).toEqual([...SOUND_EFFECT_KINDS].sort());
});

test("each catalog entry has a stable unique id and positive duration", () => {
	const ids = new Set<number>();
	for (const effect of LOCAL_SOUND_EFFECTS) {
		expect(Number.isInteger(effect.id)).toBe(true);
		expect(effect.duration).toBeGreaterThan(0);
		expect(effect.name.length).toBeGreaterThan(0);
		expect(ids.has(effect.id)).toBe(false);
		ids.add(effect.id);
	}
});

test("lookup round-trips by kind and id", () => {
	for (const effect of LOCAL_SOUND_EFFECTS) {
		expect(localSoundEffectByKind(effect.kind!)).toBe(effect);
		expect(localSoundEffectById(effect.id)).toBe(effect);
	}
});

test("isLocalSoundEffectKind distinguishes known from unknown kinds", () => {
	expect(isLocalSoundEffectKind("whoosh")).toBe(true);
	expect(isLocalSoundEffectKind("boom")).toBe(true);
	expect(isLocalSoundEffectKind("explosion")).toBe(false);
});
