import { describe, expect, test } from "bun:test";
import { imageFitDimensions, imageFitScale } from "./image-fit";

describe("production still canvas fitting", () => {
	test("covers a 1920x1080 canvas with a 1344x768 native still", () => {
		expect(imageFitScale({ canvasWidth: 1920, canvasHeight: 1080, sourceWidth: 1344, sourceHeight: 768, fit: "cover" })).toBeCloseTo(1920 / 1344, 8);
		expect(imageFitDimensions({ canvasWidth: 1920, canvasHeight: 1080, sourceWidth: 1344, sourceHeight: 768, fit: "cover" })).toEqual({ width: 1920, height: expect.closeTo(1920 * 768 / 1344, 8) });
	});

	test("covers a 1080x1920 canvas with a 768x1344 native still", () => {
		const dimensions = imageFitDimensions({ canvasWidth: 1080, canvasHeight: 1920, sourceWidth: 768, sourceHeight: 1344, fit: "cover" });
		expect(dimensions.width).toBeCloseTo(1920 * 768 / 1344, 8);
		expect(dimensions.height).toBe(1920);
	});

	test("contains ordinary images by default", () => {
		expect(imageFitDimensions({ canvasWidth: 1920, canvasHeight: 1080, sourceWidth: 1344, sourceHeight: 768 })).toEqual({ width: expect.closeTo(1080 * 1344 / 768, 8), height: 1080 });
	});
});
