import type { EffectDefinition } from "@/effects/types";
import { paramsPass, readBoolean, readNumber } from "./helpers";

export const FILM_GRAIN_SHADER = "film-grain";
export const NOISE_SHADER = "noise";
export const HALFTONE_SHADER = "halftone";
export const SCANLINES_SHADER = "scanlines";
export const OLD_FILM_SHADER = "old-film";

export const filmGrainEffectDefinition: EffectDefinition = {
	type: "film-grain",
	name: "Film Grain",
	keywords: ["grain", "film", "noise", "texture", "analog"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 20, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(FILM_GRAIN_SHADER, [
				readNumber(effectParams, "amount", 20) / 100,
				time,
			]),
		],
	},
};

export const noiseEffectDefinition: EffectDefinition = {
	type: "noise",
	name: "Noise",
	keywords: ["noise", "static", "tv", "interference", "snow"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 25, min: 0, max: 100, step: 1 },
		{ key: "monochrome", label: "Monochrome", type: "boolean", default: false },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(NOISE_SHADER, [
				readNumber(effectParams, "amount", 25) / 100,
				readBoolean(effectParams, "monochrome", false) ? 1 : 0,
				time,
			]),
		],
	},
};

export const halftoneEffectDefinition: EffectDefinition = {
	type: "halftone",
	name: "Halftone",
	keywords: ["halftone", "dot", "print", "screen", "comic"],
	params: [
		{ key: "size", label: "Dot Size", type: "number", default: 8, min: 2, max: 64, step: 1 },
		{ key: "angle", label: "Angle", type: "number", default: 45, min: 0, max: 360, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(HALFTONE_SHADER, [
				readNumber(effectParams, "size", 8),
				readNumber(effectParams, "angle", 45),
			]),
		],
	},
};

export const scanlinesEffectDefinition: EffectDefinition = {
	type: "scanlines",
	name: "Scanlines",
	keywords: ["scanlines", "crt", "tv", "lines", "retro"],
	params: [
		{ key: "spacing", label: "Spacing", type: "number", default: 4, min: 1, max: 16, step: 1 },
		{ key: "opacity", label: "Opacity", type: "number", default: 50, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(SCANLINES_SHADER, [
				readNumber(effectParams, "spacing", 4),
				readNumber(effectParams, "opacity", 50) / 100,
			]),
		],
	},
};

export const oldFilmEffectDefinition: EffectDefinition = {
	type: "old-film",
	name: "Old Film",
	keywords: ["old", "film", "vintage", "sepia", "scratch", "retro"],
	params: [
		{ key: "intensity", label: "Intensity", type: "number", default: 40, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams, time }) => [
			paramsPass(OLD_FILM_SHADER, [
				readNumber(effectParams, "intensity", 40) / 100,
				time,
			]),
		],
	},
};
