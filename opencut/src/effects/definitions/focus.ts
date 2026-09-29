import type { EffectDefinition } from "@/effects/types";
import { paramsPass, readNumber } from "./helpers";

export const ZOOM_BLUR_SHADER = "zoom-blur";
export const RADIAL_BLUR_SHADER = "radial-blur";
export const SHARPEN_SHADER = "sharpen";
export const TILT_SHIFT_SHADER = "tilt-shift";
export const VIGNETTE_SHADER = "vignette";

export const zoomBlurEffectDefinition: EffectDefinition = {
	type: "zoom-blur",
	name: "Zoom Blur",
	keywords: ["zoom", "blur", "motion", "speed", "radial"],
	params: [
		{ key: "strength", label: "Strength", type: "number", default: 40, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(ZOOM_BLUR_SHADER, [readNumber(effectParams, "strength", 40) / 100]),
		],
	},
};

export const radialBlurEffectDefinition: EffectDefinition = {
	type: "radial-blur",
	name: "Radial Blur",
	keywords: ["radial", "blur", "spin", "rotation", "motion"],
	params: [
		{ key: "strength", label: "Strength", type: "number", default: 40, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(RADIAL_BLUR_SHADER, [readNumber(effectParams, "strength", 40) / 100]),
		],
	},
};

export const sharpenEffectDefinition: EffectDefinition = {
	type: "sharpen",
	name: "Sharpen",
	keywords: ["sharpen", "sharp", "detail", "focus"],
	params: [
		{ key: "amount", label: "Amount", type: "number", default: 50, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(SHARPEN_SHADER, [readNumber(effectParams, "amount", 50) / 100]),
		],
	},
};

export const tiltShiftEffectDefinition: EffectDefinition = {
	type: "tilt-shift",
	name: "Tilt Shift",
	keywords: ["tilt", "shift", "miniature", "blur", "depth"],
	params: [
		{ key: "blur", label: "Blur", type: "number", default: 40, min: 0, max: 100, step: 1 },
		{ key: "focusY", label: "Focus Y", type: "number", default: 0.5, min: 0, max: 1, step: 0.01 },
		{ key: "band", label: "Band", type: "number", default: 0.3, min: 0.01, max: 1, step: 0.01 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(TILT_SHIFT_SHADER, [
				readNumber(effectParams, "blur", 40) / 100,
				readNumber(effectParams, "focusY", 0.5),
				readNumber(effectParams, "band", 0.3),
			]),
		],
	},
};

export const vignetteEffectDefinition: EffectDefinition = {
	type: "vignette",
	name: "Vignette",
	keywords: ["vignette", "darken", "edges", "corner"],
	params: [
		{ key: "strength", label: "Strength", type: "number", default: 60, min: 0, max: 100, step: 1 },
		{ key: "softness", label: "Softness", type: "number", default: 50, min: 0, max: 100, step: 1 },
	],
	renderer: {
		passes: [],
		buildPasses: ({ effectParams }) => [
			paramsPass(VIGNETTE_SHADER, [
				readNumber(effectParams, "strength", 60) / 100,
				readNumber(effectParams, "softness", 50) / 100,
			]),
		],
	},
};
