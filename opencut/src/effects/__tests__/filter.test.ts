import { expect, test } from "bun:test";
import type { ParamValues } from "@/params";
import {
	buildFilterPasses,
	filterEffectDefinition,
	FILTER_EFFECT_TYPE,
	FILTER_ID_PARAM,
	FILTER_INTENSITY_PARAM,
	scaleFilterAdjust,
} from "../definitions/filter";
import { ADJUST_SHADER } from "../definitions/adjust";
import { LUT_SHADER } from "../definitions/lut";
import { filterRegistry } from "../filters/registry";
import { FILTER_PRESETS } from "../filters/presets";
import { lutRegistry } from "../lut/registry";
import { registerBundledLuts } from "../lut/registry";
import { BUNDLED_LUT_SOURCES } from "../lut/bundled-luts";

registerBundledLuts({ sources: BUNDLED_LUT_SOURCES });

function buildPasses(params: ParamValues) {
	const buildPasses = filterEffectDefinition.renderer.buildPasses;
	if (!buildPasses) {
		throw new Error("filter definition must provide buildPasses");
	}
	return buildPasses({ effectParams: params, width: 1920, height: 1080 });
}

test("presets are unique, named, and reference known LUTs", () => {
	const ids = new Set<string>();
	for (const preset of FILTER_PRESETS) {
		expect(ids.has(preset.id)).toBe(false);
		ids.add(preset.id);
		expect(preset.name.length).toBeGreaterThan(0);
		expect(preset.category.length).toBeGreaterThan(0);
		expect(preset.keywords.length).toBeGreaterThan(0);
		if (preset.lutId) {
			expect(lutRegistry.has(preset.lutId)).toBe(true);
		}
	}
	expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(20);
});

test("every preset adjust value is within -100..100", () => {
	for (const preset of FILTER_PRESETS) {
		for (const value of Object.values(preset.adjust)) {
			expect(value).toBeGreaterThanOrEqual(-100);
			expect(value).toBeLessThanOrEqual(100);
		}
	}
});

test("registry exposes every preset", () => {
	for (const preset of FILTER_PRESETS) {
		expect(filterRegistry.get(preset.id)).toEqual(preset);
	}
	expect(filterRegistry.list()).toHaveLength(FILTER_PRESETS.length);
});

test("scaleFilterAdjust scales deltas toward neutral by intensity", () => {
	const filter = filterRegistry.get("vivid");
	if (!filter) throw new Error("missing vivid preset");
	const full = scaleFilterAdjust({ filter, intensity: 1 });
	const half = scaleFilterAdjust({ filter, intensity: 0.5 });
	const off = scaleFilterAdjust({ filter, intensity: 0 });

	expect(full.saturation).toBe(35);
	expect(half.saturation).toBe(17.5);
	expect(off.saturation).toBe(0);
});

test("empty filter id produces no passes", () => {
	expect(buildPasses({ intensity: 1 })).toEqual([]);
	expect(buildPasses({ filterId: "", intensity: 1 })).toEqual([]);
});

test("unknown filter id produces no passes", () => {
	expect(buildPasses({ filterId: "does-not-exist", intensity: 1 })).toEqual([]);
});

test("intensity 0 produces no passes", () => {
	expect(buildPasses({ filterId: "vivid", intensity: 0 })).toEqual([]);
});

test("adjust-only filter produces a single adjust pass", () => {
	const passes = buildPasses({ filterId: "vivid", intensity: 1 });
	expect(passes).toHaveLength(1);
	expect(passes[0].shader).toBe(ADJUST_SHADER);
	const basic = passes[0].uniforms.u_basic as number[];
	expect(basic[2]).toBe(0.35); // saturation delta 35 / 100
	expect(basic[1]).toBe(0.15); // contrast delta 15 / 100
});

test("LUT filter produces adjust + LUT passes with intensity as strength", () => {
	const passes = buildPasses({ filterId: "teal-orange", intensity: 0.5 });
	expect(passes).toHaveLength(2);
	expect(passes[0].shader).toBe(ADJUST_SHADER);
	expect(passes[1].shader).toBe(LUT_SHADER);
	expect(passes[1].uniforms.u_strength).toBe(0.5);
	const basic = passes[0].uniforms.u_basic as number[];
	expect(basic[2]).toBe(0.06); // saturation 12 * 0.5 / 100
});

test("intensity clamps to 0..1", () => {
	const passes = buildPasses({ filterId: "vivid", intensity: 2 });
	expect(passes).toHaveLength(1);
	const basic = passes[0].uniforms.u_basic as number[];
	expect(basic[2]).toBe(0.35); // clamped to full strength
});

test("filter params are text + number and intensity is 0..1", () => {
	expect(filterEffectDefinition.type).toBe(FILTER_EFFECT_TYPE);
	expect(FILTER_ID_PARAM.type).toBe("text");
	expect(FILTER_ID_PARAM.keyframable).toBe(false);
	expect(FILTER_INTENSITY_PARAM.type).toBe("number");
	expect(FILTER_INTENSITY_PARAM.min).toBe(0);
	expect(FILTER_INTENSITY_PARAM.max).toBe(1);
});
