import { describe, expect, test } from "bun:test";
import {
	applyExportResolution,
	resolveExportCanvasSize,
} from "./resolution";

describe("resolveExportCanvasSize", () => {
	test("source returns the project canvas unchanged", () => {
		expect(
			resolveExportCanvasSize({
				canvasSize: { width: 1920, height: 1080 },
				resolution: "source",
			}),
		).toEqual({ width: 1920, height: 1080 });
	});

	test("1080p scales a 4K landscape canvas down", () => {
		expect(
			resolveExportCanvasSize({
				canvasSize: { width: 3840, height: 2160 },
				resolution: "1080p",
			}),
		).toEqual({ width: 1920, height: 1080 });
	});

	test("1080p scales a 720p portrait canvas up", () => {
		expect(
			resolveExportCanvasSize({
				canvasSize: { width: 720, height: 1280 },
				resolution: "1080p",
			}),
		).toEqual({ width: 1080, height: 1920 });
	});

	test("preserves aspect ratio and rounds to even edges", () => {
		expect(
			resolveExportCanvasSize({
				canvasSize: { width: 1440, height: 1080 },
				resolution: "720p",
			}),
		).toEqual({ width: 960, height: 720 });
	});
});

describe("applyExportResolution", () => {
	test("missing resolution keeps the canvas size", () => {
		expect(
			applyExportResolution({ canvasSize: { width: 1920, height: 1080 } }),
		).toEqual({ width: 1920, height: 1080 });
	});

	test("applies an explicit resolution and clamps to even within 4K", () => {
		expect(
			applyExportResolution({
				canvasSize: { width: 1920, height: 1080 },
				resolution: { width: 5001, height: 2159 },
			}),
		).toEqual({ width: 4096, height: 2160 });
	});
});
