import { describe, expect, test } from "bun:test";
import { ANIMATION_PROPERTY_PATHS } from "@/animation/types";

const TEXT_EFFECT_PROPERTY_PATHS = [
	"stroke.color",
	"stroke.width",
	"shadow.color",
	"shadow.x",
	"shadow.y",
	"shadow.blur",
	"glow.color",
	"glow.radius",
] as const;

describe("text effect animation paths", () => {
	test("registers every text stroke/shadow/glow path for keyframing", () => {
		const registered = new Set<string>(ANIMATION_PROPERTY_PATHS);
		for (const path of TEXT_EFFECT_PROPERTY_PATHS) {
			expect(registered.has(path)).toBe(true);
		}
	});

	test("keeps the registered paths free of duplicates", () => {
		expect(new Set(ANIMATION_PROPERTY_PATHS).size).toBe(
			ANIMATION_PROPERTY_PATHS.length,
		);
	});
});
