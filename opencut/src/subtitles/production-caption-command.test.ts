import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as wasmGlue from "../../node_modules/opencut-wasm/opencut_wasm_bg.js";

// Both suites share wasm-bindgen's module-level memory caches.
try {
	wasmGlue.TICKS_PER_SECOND();
} catch {
	const wasmModule = new WebAssembly.Module(
		readFileSync(
			new URL("../../node_modules/opencut-wasm/opencut_wasm_bg.wasm", import.meta.url),
		),
	);
	const wasmInstance = new WebAssembly.Instance(wasmModule, {
		"./opencut_wasm_bg.js": wasmGlue,
	});
	wasmGlue.__wbg_set_wasm(wasmInstance.exports);
	const startWasm = wasmInstance.exports.__wbindgen_start;
	if (startWasm instanceof Function) startWasm();
}
mock.module("opencut-wasm", () => wasmGlue);

const { mapNarrationAlignment } = await import("./production-caption-command");
const { buildSubtitleTextElement } = await import("./build-subtitle-text-element");

describe("production narration caption mapping", () => {
	test("maps media-relative alignment through trim and timeline offset", () => {
		const captions = mapNarrationAlignment({
			segments: [
				{ text: "Opening line", start: 1.25, end: 2.25 },
				{ text: "Second line", start: 2.5, end: 3.5 },
			],
			trimStartSeconds: 1,
			playableDurationSeconds: 4,
			timelineStartSeconds: 10.5,
			shotStartSeconds: 10,
			shotDurationSeconds: 5,
		});

		expect(captions.map(({ text, startTime, duration }) => ({
			text,
			startTime,
			duration,
		}))).toEqual([
			{ text: "Opening line", startTime: 10.75, duration: 1 },
			{ text: "Second line", startTime: 12, duration: 1 },
		]);
	});

	test("rejects source bounds and mapped overflow instead of clipping", () => {
		expect(() => mapNarrationAlignment({
			segments: [{ text: "Before trim", start: 0.5, end: 1.5 }],
			trimStartSeconds: 1,
			playableDurationSeconds: 4,
			timelineStartSeconds: 10,
			shotStartSeconds: 10,
			shotDurationSeconds: 5,
		})).toThrow("outside the playable narration bounds");

		expect(() => mapNarrationAlignment({
			segments: [{ text: "Past picture", start: 1, end: 5 }],
			trimStartSeconds: 1,
			playableDurationSeconds: 4,
			timelineStartSeconds: 12,
			shotStartSeconds: 10,
			shotDurationSeconds: 5,
		})).toThrow("outside the shot bounds");
	});

	test("maps more than 5,000 verified segments without truncation", () => {
		const segments = Array.from({ length: 5_001 }, (_, index) => ({
			text: `word-${index}`,
			start: index,
			end: index + 1,
		}));
		const captions = mapNarrationAlignment({
			segments,
			trimStartSeconds: 0,
			playableDurationSeconds: 5_001,
			timelineStartSeconds: 0,
			shotStartSeconds: 0,
			shotDurationSeconds: 5_001,
		});

		expect(captions).toHaveLength(5_001);
		expect(captions.at(-1)).toMatchObject({
			text: "word-5000",
			startTime: 5_000,
			duration: 1,
		});
	});

	test("keeps the browser measurement entry available", () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, "document");
		const createElement = mock(() => ({
			width: 0,
			height: 0,
			getContext: () => null,
		}));
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: { createElement },
		});
		try {
			const element = buildSubtitleTextElement({
				index: 0,
				caption: { text: "Measured in a browser", startTime: 1, duration: 2 },
				canvasSize: { width: 1920, height: 1080 },
			});
			expect(createElement).toHaveBeenCalledWith("canvas");
			expect(element.params.content).toBe("Measured in a browser");
		} finally {
			if (original) Object.defineProperty(globalThis, "document", original);
			else Reflect.deleteProperty(globalThis, "document");
		}
	});
	test("preserves short verified timing and refuses empty or overlapping alignment", () => {
		const bounds = {
			trimStartSeconds: 0, playableDurationSeconds: 1,
			timelineStartSeconds: 2, shotStartSeconds: 2, shotDurationSeconds: 1,
		};
		expect(mapNarrationAlignment({
			...bounds, segments: [{ text: "Short", start: 0.1, end: 0.2 }],
		})).toEqual([{ text: "Short", startTime: 2.1, duration: 0.1 }]);
		expect(() => mapNarrationAlignment({ ...bounds, segments: [] })).toThrow();
		expect(() => mapNarrationAlignment({
			...bounds, segments: [
				{ text: "First", start: 0.1, end: 0.5 },
				{ text: "Overlapping", start: 0.4, end: 0.7 },
			],
		})).toThrow();
	});

});
