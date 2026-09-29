import { describe, expect, test } from "bun:test";
import {
	buildDefaultTransition,
	isTransitionType,
	transitionsRegistry,
} from "@/transitions";
import { mediaTimeToSeconds } from "@/wasm";

describe("transitions registry", () => {
	test("registers every supported transition type", () => {
		const types = transitionsRegistry.getAll().map((definition) => definition.type);
		expect(types).toEqual([
			"cross-dissolve",
			"dip-to-black",
			"dip-to-white",
			"slide-left",
			"slide-right",
			"slide-up",
			"slide-down",
			"wipe-left",
			"wipe-right",
			"wipe-up",
			"wipe-down",
			"zoom",
			"blur",
		]);
	});

	test("every definition exposes a compose function", () => {
		for (const definition of transitionsRegistry.getAll()) {
			expect(typeof definition.compose).toBe("function");
			expect(isTransitionType(definition.type)).toBe(true);
		}
	});

	test("buildDefaultTransition produces the default half-second duration", () => {
		const transition = buildDefaultTransition({ type: "zoom" });
		expect(transition.type).toBe("zoom");
		expect(typeof transition.id).toBe("string");
		expect(transition.id.length).toBeGreaterThan(0);
		expect(mediaTimeToSeconds({ time: transition.duration })).toBeCloseTo(0.5, 5);
	});

	test("isTransitionType rejects unknown types", () => {
		expect(isTransitionType("bogus")).toBe(false);
		expect(isTransitionType("cross-dissolve")).toBe(true);
	});
});
