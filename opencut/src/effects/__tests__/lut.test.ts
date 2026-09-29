import { expect, test } from "bun:test";
import { parseCubeLut } from "../lut/cube";
import { lutRegistry } from "../lut/registry";
import { lutEffectDefinition, LUT_EFFECT_TYPE, LUT_SHADER } from "../definitions/lut";
import type { ParamValues } from "@/params";

function cube3d(size: number, values: number[]): string {
	const header = `TITLE "Test"\nLUT_3D_SIZE ${size}\n`;
	const rows = [];
	for (let i = 0; i < values.length; i += 3) {
		rows.push(values.slice(i, i + 3).join(" "));
	}
	return header + rows.join("\n") + "\n";
}

test("parseCubeLut parses size, domain, and comments", () => {
	const cube = [
		"# a comment",
		'TITLE "Test LUT"',
		"DOMAIN_MIN 0.1 0.1 0.1",
		"DOMAIN_MAX 0.9 0.9 0.9",
		"LUT_3D_SIZE 2",
		"0.0 0.0 0.0",
		"1.0 0.0 0.0",
		"0.0 1.0 0.0",
		"1.0 1.0 0.0",
		"0.0 0.0 1.0",
		"1.0 0.0 1.0",
		"0.0 1.0 1.0",
		"1.0 1.0 1.0",
	].join("\n");

	const lut = parseCubeLut(cube);
	expect(lut.size).toBe(2);
	expect(lut.domainMin).toBe(0.1);
	expect(lut.domainMax).toBe(0.9);
	expect(lut.data).toHaveLength(2 * 2 * 2 * 3);
	expect(lut.data.slice(0, 3)).toEqual([0, 0, 0]);
	expect(lut.data.slice(-3)).toEqual([1, 1, 1]);
});

test("parseCubeLut skips a preceding 1D block", () => {
	const cube = [
		"LUT_1D_SIZE 2",
		"0.5 0.5 0.5",
		"0.9 0.9 0.9",
		"LUT_3D_SIZE 2",
		"0.0 0.0 0.0",
		"1.0 0.0 0.0",
		"0.0 1.0 0.0",
		"1.0 1.0 0.0",
		"0.0 0.0 1.0",
		"1.0 0.0 1.0",
		"0.0 1.0 1.0",
		"1.0 1.0 1.0",
	].join("\n");

	const lut = parseCubeLut(cube);
	expect(lut.size).toBe(2);
	expect(lut.data).toHaveLength(24);
	expect(lut.data.slice(0, 3)).toEqual([0, 0, 0]);
});

test("parseCubeLut rejects a 1D-only LUT", () => {
	expect(() =>
		parseCubeLut("LUT_1D_SIZE 2\n0.0 0.0 0.0\n1.0 1.0 1.0\n"),
	).toThrow();
});

test("parseCubeLut rejects truncated 3D data", () => {
	expect(() => parseCubeLut(cube3d(2, [0, 0, 0]))).toThrow();
});

test("lut effect builds a pass referencing a registered LUT", () => {
	lutRegistry.register({
		id: "test-lut",
		name: "Test",
		source: "bundled",
		lut: { size: 2, data: new Array(24).fill(0), domainMin: 0, domainMax: 1 },
	});

	const build = lutEffectDefinition.renderer.buildPasses;
	if (!build) throw new Error("lut definition must provide buildPasses");

	const passes = build({
		effectParams: { lutId: "test-lut", strength: 0.5 },
		width: 1920,
		height: 1080,
	});

	expect(passes).toHaveLength(1);
	expect(passes[0].shader).toBe(LUT_SHADER);
	expect(passes[0].uniforms).toEqual({ u_strength: 0.5 });
	expect(passes[0].lut?.size).toBe(2);
	expect(passes[0].lut?.domainMin).toBe(0);
});

test("lut effect clamps strength and skips inactive passes", () => {
	const build = lutEffectDefinition.renderer.buildPasses;
	if (!build) throw new Error("lut definition must provide buildPasses");

	const params = (partial: ParamValues) => build({ effectParams: partial, width: 100, height: 100 });

	expect(params({ lutId: "unknown", strength: 1 })).toEqual([]);
	expect(params({ lutId: "test-lut", strength: 0 })).toEqual([]);
	expect(params({ strength: 1 })).toEqual([]);

	const passes = params({ lutId: "test-lut", strength: 2 });
	expect(passes).toHaveLength(1);
	expect(passes[0].uniforms.u_strength).toBe(1);
});

test("lut params are text + number and strength is 0..1", () => {
	expect(lutEffectDefinition.type).toBe(LUT_EFFECT_TYPE);
	const lutId = lutEffectDefinition.params.find((p) => p.key === "lutId");
	const strength = lutEffectDefinition.params.find((p) => p.key === "strength");
	expect(lutId?.type).toBe("text");
	expect(strength?.type).toBe("number");
	expect(strength?.min).toBe(0);
	expect(strength?.max).toBe(1);
});
