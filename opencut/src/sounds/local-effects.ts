import {
	SOUND_EFFECT_KINDS,
	defaultSoundEffectDuration,
	type SoundEffectKind,
} from "@/media/sound-effects";
import type { SoundEffect } from "@/sounds/types";

interface LocalEffectDefinition {
	id: number;
	kind: SoundEffectKind;
	name: string;
	description: string;
	tags: string[];
}

// Stable numeric ids so saved local effects can be round-tripped through the
// existing saved-sounds entity without a remote Freesound id. The values are
// deliberately opaque and outside the Freesound id space.
const LOCAL_EFFECT_DEFINITIONS: readonly LocalEffectDefinition[] = [
	{
		id: 81001,
		kind: "whoosh",
		name: "Whoosh",
		description: "Deep airy sweep",
		tags: ["whoosh", "transition", "sweep"],
	},
	{
		id: 81002,
		kind: "swoosh",
		name: "Swoosh",
		description: "Quick airy sweep",
		tags: ["swoosh", "transition", "sweep"],
	},
	{
		id: 81003,
		kind: "riser",
		name: "Riser",
		description: "Rising tension sweep",
		tags: ["riser", "build", "sweep"],
	},
	{
		id: 81004,
		kind: "pop",
		name: "Pop",
		description: "Plucky pop",
		tags: ["pop", "pluck", "hit"],
	},
	{
		id: 81005,
		kind: "crack",
		name: "Crack",
		description: "Sharp crack",
		tags: ["crack", "impact", "noise"],
	},
	{
		id: 81006,
		kind: "click",
		name: "Click",
		description: "Short click",
		tags: ["click", "ui", "short"],
	},
	{
		id: 81007,
		kind: "ding",
		name: "Ding",
		description: "Bright bell ding",
		tags: ["ding", "bell", "notification"],
	},
	{
		id: 81008,
		kind: "boom",
		name: "Boom",
		description: "Deep bass boom",
		tags: ["boom", "impact", "bass"],
	},
];

const LICENSE = "OpenCut synthesized (no recordings)";

function toSoundEffect(definition: LocalEffectDefinition): SoundEffect {
	return {
		id: definition.id,
		name: definition.name,
		description: definition.description,
		url: "",
		duration: defaultSoundEffectDuration(definition.kind),
		filesize: 0,
		type: "audio",
		channels: 1,
		bitrate: 0,
		bitdepth: 16,
		samplerate: 48000,
		username: "OpenCut",
		tags: definition.tags,
		license: LICENSE,
		created: "",
		downloads: 0,
		rating: 0,
		ratingCount: 0,
		kind: definition.kind,
	};
}

export const LOCAL_SOUND_EFFECTS: readonly SoundEffect[] =
	LOCAL_EFFECT_DEFINITIONS.map(toSoundEffect);

const BY_ID = new Map(LOCAL_SOUND_EFFECTS.map((effect) => [effect.id, effect]));
const BY_KIND = new Map(
	LOCAL_SOUND_EFFECTS.map((effect) => [effect.kind, effect]),
);

export function localSoundEffectByKind(
	kind: SoundEffectKind,
): SoundEffect | undefined {
	return BY_KIND.get(kind);
}

export function localSoundEffectById(id: number): SoundEffect | undefined {
	return BY_ID.get(id);
}

export function isLocalSoundEffectKind(kind: string): kind is SoundEffectKind {
	return (SOUND_EFFECT_KINDS as readonly string[]).includes(kind);
}
