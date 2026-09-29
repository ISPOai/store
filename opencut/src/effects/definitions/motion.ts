import type { EffectDefinition } from "@/effects/types";
import { paramsPass, readNumber } from "./helpers";

export const SHAKE_SHADER = "shake";
export const FLICKER_SHADER = "flicker";

export const shakeEffectDefinition: EffectDefinition = {
	type: "shake",
	name: "Shake",
	keywords: ["shake", "camera", "jitter", "earthquake", "vibrate"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 30, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(SHAKE_SHADER, [
				readNumber(effectParams, "intensity", 30) / 100,
				time,
			]),
		],
	},
};

export const flickerEffectDefinition: EffectDefinition = {
	type: "flicker",
	name: "Flicker",
	keywords: ["flicker", "strobe", "blink", "light", "pulse"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 40, min: 0, max: 100, step: 1 },
		{ key: "speed", label: "Speed", type: "number", default: 6, min: 0.1, max: 20, step: 0.1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(FLICKER_SHADER, [
				readNumber(effectParams, "intensity", 40) / 100,
				readNumber(effectParams, "speed", 6),
				time,
			]),
		],
	},
};
