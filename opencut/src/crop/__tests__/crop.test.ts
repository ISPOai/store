import { describe, expect, test } from "bun:test";
import {
	readCropFromParams,
	readFlipFromParams,
	writeCropToParams,
	writeFlipToParams,
	resolveElementImageFit,
} from "@/crop/crop";
import {
	computeCropFrame,
	cropRectLocal,
	cropFromHandleDrag,
	toFrameLocal,
	fromFrameLocal,
	type CropFrame,
} from "@/crop/crop-frame";
import { imageFitDimensions, imageFitScale } from "@/services/renderer/image-fit";
import type { ImageElement, VideoElement } from "@/timeline";
import type { Transform } from "@/rendering";

function cropParams(overrides: Record<string, unknown> = {}) {
	return { ...overrides };
}

describe("crop params", () => {
	test("reads zero crop and no flip by default", () => {
		expect(readCropFromParams({ params: {} })).toEqual({
			left: 0,
			top: 0,
			right: 0,
			bottom: 0,
		});
		expect(readFlipFromParams({ params: {} })).toEqual({
			flipX: false,
			flipY: false,
		});
	});

	test("reads and clamps crop values into [0,1]", () => {
		const crop = readCropFromParams({
			params: cropParams({ "crop.left": 2, "crop.top": -1, "crop.right": 0.25, "crop.bottom": 0.5 }),
		});
		expect(crop).toEqual({ left: 1, top: 0, right: 0.25, bottom: 0.5 });
	});

	test("writes crop and flip onto existing params", () => {
		const base = cropParams({ opacity: 0.8 });
		const cropped = writeCropToParams({
			params: base,
			crop: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 },
		});
		expect(cropped.opacity).toBe(0.8);
		expect(cropped["crop.left"]).toBe(0.1);
		const flipped = writeFlipToParams({ params: cropped, flipX: true, flipY: false });
		expect(flipped.flipX).toBe(true);
		expect(flipped.flipY).toBe(false);
	});

	test("resolves image fit", () => {
		const image = { type: "image" } as ImageElement;
		expect(resolveElementImageFit({ element: image })).toBe("contain");
		expect(
			resolveElementImageFit({
				element: { type: "image", fit: "cover" } as ImageElement,
			}),
		).toBe("cover");
		expect(
			resolveElementImageFit({
				element: {
					type: "image",
					production: { owner: "opencut-production" },
				} as unknown as ImageElement,
			}),
		).toBe("cover");
		expect(
			resolveElementImageFit({ element: { type: "video" } as VideoElement }),
		).toBe("contain");
	});
});

describe("image-fit crop", () => {
	test("crop trims the source before contain fit", () => {
		const dims = imageFitDimensions({
			canvasWidth: 1920,
			canvasHeight: 1080,
			sourceWidth: 1920,
			sourceHeight: 1080,
			crop: { left: 0.25, top: 0, right: 0.25, bottom: 0 },
		});
		// Cropping to a 960x1080 (portrait) source is height-limited at scale 1.
		expect(dims.width).toBeCloseTo(960, 6);
		expect(dims.height).toBeCloseTo(1080, 6);
	});

	test("cover crop zooms into the remaining source", () => {
		const dims = imageFitDimensions({
			canvasWidth: 1920,
			canvasHeight: 1080,
			sourceWidth: 1920,
			sourceHeight: 1080,
			fit: "cover",
			crop: { left: 0.25, top: 0, right: 0, bottom: 0 },
		});
		// Cropping to 1440x1080 cover scales by 1920/1440 to fill the width.
		expect(dims.width).toBeCloseTo(1920, 6);
		expect(dims.height).toBeCloseTo(1920 * 1080 / 1440, 6);
	});

	test("no crop matches uncropped fit", () => {
		const cropped = imageFitDimensions({
			canvasWidth: 1920,
			canvasHeight: 1080,
			sourceWidth: 1344,
			sourceHeight: 768,
			crop: { left: 0, top: 0, right: 0, bottom: 0 },
		});
		const plain = imageFitDimensions({
			canvasWidth: 1920,
			canvasHeight: 1080,
			sourceWidth: 1344,
			sourceHeight: 768,
		});
		expect(cropped).toEqual(plain);
	});
});

describe("crop frame geometry", () => {
	const transform: Transform = {
		scaleX: 1,
		scaleY: 1,
		position: { x: 0, y: 0 },
		rotate: 0,
	};

	function frame(): CropFrame {
		return computeCropFrame({
			element: { type: "video" } as VideoElement,
			canvasSize: { width: 1920, height: 1080 },
			mediaAsset: { width: 1920, height: 1080 } as never,
			transform,
		});
	}

	test("computeCropFrame fills a matching canvas", () => {
		const f = frame();
		expect(f.cx).toBeCloseTo(960, 6);
		expect(f.cy).toBeCloseTo(540, 6);
		expect(f.width).toBeCloseTo(1920, 6);
		expect(f.height).toBeCloseTo(1080, 6);
	});

	test("cropRectLocal maps crop fractions to frame edges", () => {
		const rect = cropRectLocal({
			frame: frame(),
			crop: { left: 0.25, top: 0.5, right: 0.1, bottom: 0 },
		});
		expect(rect.left).toBeCloseTo(-960 + 0.25 * 1920, 6);
		expect(rect.right).toBeCloseTo(960 - 0.1 * 1920, 6);
		expect(rect.top).toBeCloseTo(-540 + 0.5 * 1080, 6);
		expect(rect.bottom).toBeCloseTo(540, 6);
	});

	test("dragging a corner updates two edges and clamps against the opposite", () => {
		const result = cropFromHandleDrag({
			crop: { left: 0, top: 0, right: 0.5, bottom: 0 },
			handle: "top-left",
			localX: -480,
			localY: -540,
			frameWidth: 1920,
			frameHeight: 1080,
		});
		// localX -480 => fraction 0.25; localY -540 => fraction 0.
		expect(result.left).toBeCloseTo(0.25, 6);
		expect(result.top).toBeCloseTo(0, 6);
		expect(result.right).toBe(0.5);
		// Dragging left past the right edge clamps to keep right edge fixed.
		const clamped = cropFromHandleDrag({
			crop: { left: 0, top: 0, right: 0.5, bottom: 0 },
			handle: "left",
			localX: 960,
			localY: 0,
			frameWidth: 1920,
			frameHeight: 1080,
		});
		expect(clamped.left).toBeCloseTo(0.5, 6);
	});

	test("toFrameLocal and fromFrameLocal invert", () => {
		const local = toFrameLocal({ dx: 100, dy: 50, rotation: 45 });
		const back = fromFrameLocal({ x: local.x, y: local.y, rotation: 45 });
		expect(back.x).toBeCloseTo(100, 6);
		expect(back.y).toBeCloseTo(50, 6);
	});

	test("imageFitScale cover with crop", () => {
		const scale = imageFitScale({
			canvasWidth: 1080,
			canvasHeight: 1920,
			sourceWidth: 768,
			sourceHeight: 1344,
			fit: "cover",
			crop: { left: 0.5, top: 0, right: 0, bottom: 0 },
		});
		// Cropping half the width makes the remaining source narrower, so cover scale grows.
		expect(scale).toBeCloseTo(1080 / (768 * 0.5), 6);
	});
});
