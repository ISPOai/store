import { describe, expect, test } from "bun:test";
import {
	DEFAULT_TEXT_ANIMATION_DURATION_SECONDS,
	TEXT_ANIMATION_PRESET_NAMES,
	buildTextAnimationPresetKeyframes,
	getTextAnimationPresetDefinition,
	getTextAnimationPresetPaths,
	isTextAnimationPresetName,
	mergePresetAnimations,
	removeAnimationPaths,
} from "@/animation/presets";
import type { ElementAnimations } from "@/animation/types";

const CANVAS = { width: 1920, height: 1080 };
const ELEMENT_DURATION = 5;

function build({
	name,
	phase,
	durationSeconds = 1,
}: {
	name: (typeof TEXT_ANIMATION_PRESET_NAMES)[number];
	phase: "in" | "out" | "loop";
	durationSeconds?: number;
}) {
	return buildTextAnimationPresetKeyframes({
		name,
		phase,
		durationSeconds,
		elementDurationSeconds: ELEMENT_DURATION,
		canvasWidth: CANVAS.width,
		canvasHeight: CANVAS.height,
	});
}

describe("text animation preset registry", () => {
	test("every preset name is recognized", () => {
		for (const name of TEXT_ANIMATION_PRESET_NAMES) {
			expect(isTextAnimationPresetName(name)).toBe(true);
		}
		expect(isTextAnimationPresetName("nope")).toBe(false);
	});

	test("definitions declare phases and paths", () => {
		const definition = getTextAnimationPresetDefinition("fade");
		expect(definition.phases).toEqual(["in", "out", "loop"]);
		expect(getTextAnimationPresetPaths("fade")).toEqual(["opacity"]);

		const blurIn = getTextAnimationPresetDefinition("blur-in");
		expect(blurIn.phases).toEqual(["in"]);
	});
});

describe("fade preset", () => {
	test("in fades opacity 0 -> 1 across the duration", () => {
		const keyframes = build({ name: "fade", phase: "in", durationSeconds: 2 });
		expect(keyframes.opacity).toHaveLength(2);
		expect(keyframes.opacity?.[0]).toMatchObject({ time: 0, value: 0 });
		expect(keyframes.opacity?.[1]).toMatchObject({ time: 2, value: 1 });
	});

	test("out fades opacity 1 -> 0 at the end of the element", () => {
		const keyframes = build({ name: "fade", phase: "out", durationSeconds: 2 });
		expect(keyframes.opacity?.[0]).toMatchObject({ time: 3, value: 1 });
		expect(keyframes.opacity?.[1]).toMatchObject({ time: 5, value: 0 });
	});

	test("loop pulses opacity across the full element", () => {
		const keyframes = build({ name: "fade", phase: "loop", durationSeconds: 2.5 });
		const keys = keyframes.opacity ?? [];
		expect(keys.length).toBeGreaterThanOrEqual(3);
		expect(keys[0]).toMatchObject({ time: 0, value: 1 });
		expect(keys[keys.length - 1]).toMatchObject({ time: ELEMENT_DURATION, value: 1 });
		expect(Math.min(...keys.map((key) => key.value))).toBeLessThan(1);
	});
});

describe("slide preset", () => {
	test("slide-left animates positionX from off-screen to center", () => {
		const keyframes = build({ name: "slide-left", phase: "in", durationSeconds: 1 });
		const keys = keyframes["transform.positionX"] ?? [];
		expect(keys[0]).toMatchObject({ time: 0, value: -1920 });
		expect(keys[1]).toMatchObject({ time: 1, value: 0 });
		expect(keyframes["transform.positionY"]).toBeUndefined();
	});

	test("slide-down animates positionY from below to center", () => {
		const keyframes = build({ name: "slide-down", phase: "in", durationSeconds: 1 });
		expect(keyframes["transform.positionY"]?.[0]).toMatchObject({
			time: 0,
			value: 1080,
		});
	});

	test("slide-right out moves from center toward the right edge", () => {
		const keyframes = build({ name: "slide-right", phase: "out", durationSeconds: 1 });
		expect(keyframes["transform.positionX"]?.[0]).toMatchObject({ value: 0 });
		expect(keyframes["transform.positionX"]?.[1]).toMatchObject({
			time: 5,
			value: 1920,
		});
	});
});

describe("pop, scale, bounce, wave presets", () => {
	test("pop in overshoots scale above 1 before settling", () => {
		const keyframes = build({ name: "pop", phase: "in", durationSeconds: 1 });
		const scaleX = keyframes["transform.scaleX"] ?? [];
		expect(scaleX[0]).toMatchObject({ value: 0 });
		expect(scaleX[1].value).toBeGreaterThan(1);
		expect(scaleX[2]).toMatchObject({ time: 1, value: 1 });
		expect(keyframes["transform.scaleY"]).toEqual(scaleX);
	});

	test("scale out shrinks to zero", () => {
		const keyframes = build({ name: "scale", phase: "out", durationSeconds: 1 });
		expect(keyframes["transform.scaleX"]?.[1]).toMatchObject({ time: 5, value: 0 });
	});

	test("bounce in starts above baseline and settles at zero", () => {
		const keyframes = build({ name: "bounce", phase: "in", durationSeconds: 2 });
		const keys = keyframes["transform.positionY"] ?? [];
		expect(keys[0].value).toBeLessThan(0);
		expect(keys[keys.length - 1]).toMatchObject({ time: 2, value: 0 });
	});

	test("wave loop oscillates rotate and returns to its start value", () => {
		const keyframes = build({ name: "wave", phase: "loop", durationSeconds: 1 });
		const keys = keyframes["transform.rotate"] ?? [];
		expect(keys[0].value).toBe(-12);
		expect(keys[keys.length - 1]).toMatchObject({
			time: ELEMENT_DURATION,
			value: -12,
		});
		expect(Math.max(...keys.map((key) => key.value))).toBe(12);
	});
});

describe("blur-in and typewriter presets", () => {
	test("blur-in only builds an entrance animation", () => {
		expect(build({ name: "blur-in", phase: "out" })).toEqual({});
		const keyframes = build({ name: "blur-in", phase: "in", durationSeconds: 1 });
		expect(keyframes.opacity).toBeDefined();
		expect(keyframes["transform.scaleX"]?.[0].value).toBeGreaterThan(1);
		expect(keyframes["transform.scaleX"]?.[1]).toMatchObject({ time: 1, value: 1 });
	});

	test("typewriter reveals opacity in monotonic steps", () => {
		const keyframes = build({ name: "typewriter", phase: "in", durationSeconds: 2 });
		const keys = keyframes.opacity ?? [];
		expect(keys).toHaveLength(11);
		expect(keys[0]).toMatchObject({ time: 0, value: 0, segmentToNext: "step" });
		expect(keys[keys.length - 1]).toMatchObject({ time: 2, value: 1 });
		for (let index = 1; index < keys.length; index++) {
			expect(keys[index].value).toBeGreaterThanOrEqual(keys[index - 1].value);
		}
	});

	test("typewriter out hides opacity in reverse steps", () => {
		const keyframes = build({ name: "typewriter", phase: "out", durationSeconds: 2 });
		const keys = keyframes.opacity ?? [];
		expect(keys[0]).toMatchObject({ time: 3, value: 1 });
		expect(keys[keys.length - 1]).toMatchObject({ time: 5, value: 0 });
	});
});

describe("merge and remove helpers", () => {
	function scalarChannel(value: number): ElementAnimations[string] {
		return {
			keys: [
				{
					id: "k1",
					time: 0,
					value,
					segmentToNext: "linear",
					tangentMode: "flat",
				},
			],
		} as ElementAnimations[string];
	}

	test("merge removes the previous preset's paths and adds the new ones", () => {
		const animations: ElementAnimations = {
			opacity: scalarChannel(1),
			"transform.scaleX": scalarChannel(1),
		};
		const merged = mergePresetAnimations({
			animations,
			removePaths: ["opacity"],
			presetAnimations: {
				"transform.positionX": scalarChannel(0),
			},
		});
		expect(Object.keys(merged ?? {}).sort()).toEqual([
			"transform.positionX",
			"transform.scaleX",
		]);
	});

	test("remove clears all requested paths and drops empty animations", () => {
		const animations: ElementAnimations = { opacity: scalarChannel(1) };
		expect(removeAnimationPaths({ animations, paths: ["opacity"] })).toBeUndefined();
		const two = { ...animations, "transform.scaleX": scalarChannel(1) };
		expect(removeAnimationPaths({ animations: two, paths: ["opacity"] })).toEqual({
			"transform.scaleX": two["transform.scaleX"],
		});
	});

	test("default duration constant is a positive finite number", () => {
		expect(DEFAULT_TEXT_ANIMATION_DURATION_SECONDS).toBeGreaterThan(0);
	});
});
