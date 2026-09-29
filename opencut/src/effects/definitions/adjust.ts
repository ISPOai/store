import type { EffectDefinition, EffectPass } from "@/effects/types";
import type { ParamDefinition, ParamValues } from "@/params";

export const ADJUST_SHADER = "adjust";

export const ADJUST_HSL_BANDS = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"magenta",
] as const;

export type AdjustHslBand = (typeof ADJUST_HSL_BANDS)[number];

export const ADJUST_CURVE_CHANNELS = ["luma", "red", "green", "blue"] as const;

export type AdjustCurveChannel = (typeof ADJUST_CURVE_CHANNELS)[number];

export const ADJUST_CURVE_INTERIOR_POINTS = [1, 2] as const;

const BASIC_PARAMS: ParamDefinition[] = [
	{ key: "exposure", label: "Exposure", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "contrast", label: "Contrast", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "saturation", label: "Saturation", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "temperature", label: "Temperature", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "tint", label: "Tint", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "highlights", label: "Highlights", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
	{ key: "shadows", label: "Shadows", type: "number", default: 0, min: -100, max: 100, step: 1, hidden: true },
];

function buildHslParams(): ParamDefinition[] {
	const params: ParamDefinition[] = [];
	for (const band of ADJUST_HSL_BANDS) {
		const label = band[0].toUpperCase() + band.slice(1);
		params.push({
			key: `hsl.${band}.hue`,
			label: `${label} Hue`,
			type: "number",
			default: 0,
			min: -180,
			max: 180,
			step: 1,
			hidden: true,
		});
		params.push({
			key: `hsl.${band}.saturation`,
			label: `${label} Saturation`,
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			hidden: true,
		});
		params.push({
			key: `hsl.${band}.lightness`,
			label: `${label} Lightness`,
			type: "number",
			default: 0,
			min: -100,
			max: 100,
			step: 1,
			hidden: true,
		});
	}
	return params;
}

const CURVE_POINT_DEFAULTS: Record<number, { x: number; y: number }> = {
	1: { x: 0.33, y: 0.33 },
	2: { x: 0.67, y: 0.67 },
};

function buildCurveParams(): ParamDefinition[] {
	const params: ParamDefinition[] = [];
	for (const channel of ADJUST_CURVE_CHANNELS) {
		for (const point of ADJUST_CURVE_INTERIOR_POINTS) {
			const pointDefaults = CURVE_POINT_DEFAULTS[point];
			params.push({
				key: `curve.${channel}.${point}.x`,
				label: `${channel} curve point ${point} x`,
				type: "number",
				default: pointDefaults.x,
				min: 0,
				max: 1,
				step: 0.01,
				hidden: true,
			});
			params.push({
				key: `curve.${channel}.${point}.y`,
				label: `${channel} curve point ${point} y`,
				type: "number",
				default: pointDefaults.y,
				min: 0,
				max: 1,
				step: 0.01,
				hidden: true,
			});
		}
	}
	return params;
}

function readNumber(params: ParamValues, key: string, fallback: number): number {
	const raw = params[key];
	return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function readCurvePoint({
	params,
	channel,
	point,
}: {
	params: ParamValues;
	channel: AdjustCurveChannel;
	point: number;
}): { x: number; y: number } {
	const defaults = CURVE_POINT_DEFAULTS[point];
	return {
		x: readNumber(params, `curve.${channel}.${point}.x`, defaults.x),
		y: readNumber(params, `curve.${channel}.${point}.y`, defaults.y),
	};
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function buildAdjustPasses({
	effectParams,
}: {
	effectParams: ParamValues;
}): EffectPass[] {
	const basic = [
		readNumber(effectParams, "exposure", 0) / 100,
		readNumber(effectParams, "contrast", 0) / 100,
		readNumber(effectParams, "saturation", 0) / 100,
		readNumber(effectParams, "temperature", 0) / 100,
		readNumber(effectParams, "tint", 0) / 100,
		readNumber(effectParams, "highlights", 0) / 100,
		readNumber(effectParams, "shadows", 0) / 100,
	];

	const hsl: number[] = [];
	for (const band of ADJUST_HSL_BANDS) {
		hsl.push(readNumber(effectParams, `hsl.${band}.hue`, 0));
		hsl.push(readNumber(effectParams, `hsl.${band}.saturation`, 0) / 100);
		hsl.push(readNumber(effectParams, `hsl.${band}.lightness`, 0) / 100);
	}

	const curveCounts = [4, 4, 4, 4];
	const curves: number[] = [];
	for (const channel of ADJUST_CURVE_CHANNELS) {
		const p1 = readCurvePoint({ params: effectParams, channel, point: 1 });
		const p2 = readCurvePoint({ params: effectParams, channel, point: 2 });
		const sorted = [
			{ x: 0, y: 0 },
			{ x: clamp01(p1.x), y: clamp01(p1.y) },
			{ x: clamp01(p2.x), y: clamp01(p2.y) },
			{ x: 1, y: 1 },
		].sort((a, b) => a.x - b.x);
		for (const point of sorted) {
			curves.push(point.x, point.y);
		}
	}

	return [
		{
			shader: ADJUST_SHADER,
			uniforms: {
				u_basic: basic,
				u_hsl: hsl,
				u_curve_counts: curveCounts,
				u_curves: curves,
			},
		},
	];
}

export const adjustEffectDefinition: EffectDefinition = {
	type: "adjust",
	name: "Adjust",
	keywords: ["adjust", "color", "exposure", "contrast", "saturation", "temperature", "tint", "hsl", "curves", "highlights", "shadows"],
	params: [...BASIC_PARAMS, ...buildHslParams(), ...buildCurveParams()],
	renderer: {
		passes: [],
		buildPasses: buildAdjustPasses,
	},
};
