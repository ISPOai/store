import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as wasmGlue from "../../../node_modules/opencut-wasm/opencut_wasm_bg.js";
import type { TProject } from "@/project/types";
import { buildDefaultScene } from "@/timeline/scenes";
import type { ProductionPlacementReceipt } from "@/timeline/types";
import type { SerializedProject } from "./types";

try {
	wasmGlue.TICKS_PER_SECOND();
} catch {
	const wasmModule = new WebAssembly.Module(
		readFileSync(
			new URL(
				"../../../node_modules/opencut-wasm/opencut_wasm_bg.wasm",
				import.meta.url,
			),
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

const { mediaTime } = await import("@/wasm");
const { StorageService } = await import("./service");

function project(): TProject {
	return {
		metadata: {
			id: "new-project",
			name: "New project",
			duration: mediaTime({ ticks: 0 }),
			createdAt: new Date("2026-09-10T00:00:00.000Z"),
			updatedAt: new Date("2026-09-10T00:00:00.000Z"),
		},
		scenes: [],
		currentSceneId: "",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 32,
	};
}

function losslessJson(value: SerializedProject): SerializedProject {
	const encoded = JSON.stringify(value, (_key, nested) => {
		if (nested === undefined) {
			throw new Error("serialized project contains an undefined value");
		}
		return nested;
	});
	return JSON.parse(encoded);
}

describe("project storage serialization", () => {
	test("round trips production placement receipts with editor saves", () => {
		const source = project();
		const scene = buildDefaultScene({ name: "Main scene", isMain: true });
		const receipt: ProductionPlacementReceipt = {
			idempotencyKey: "placement-1",
			requestDigest: "request-digest",
			expectedIntentRevision: "4",
			documentIntentRevision: "5",
			tracks: [{ role: "visual", trackId: "production-visual" }],
			elements: [{
				shotId: "shot-1",
				role: "visual",
				trackId: "production-visual",
				elementId: "element-1",
			}],
		};
		source.scenes = [{ ...scene, productionPlacementReceipts: [receipt] }];
		source.currentSceneId = scene.id;

		const serialized = new StorageService().serializeProject({ project: source });

		expect(serialized.scenes[0]?.productionPlacementReceipts).toEqual([receipt]);
		expect(losslessJson(serialized)).toEqual(serialized);
	});

	test("new project payload is lossless JSON and omits an absent thumbnail", () => {
		const serialized = new StorageService().serializeProject({ project: project() });

		expect(serialized.metadata).not.toHaveProperty("thumbnail");
		expect(losslessJson(serialized)).toEqual(serialized);
	});

	test("runtime binary thumbnail values never cross the JSON boundary", () => {
		const withBlob = Object.assign(project(), {
			metadata: Object.assign(project().metadata, {
				thumbnail: new Blob(["binary thumbnail"]),
			}),
		});
		const serialized = new StorageService().serializeProject({ project: withBlob });

		expect(serialized.metadata).not.toHaveProperty("thumbnail");
		expect(losslessJson(serialized)).toEqual(serialized);
	});

	test("oversized derived thumbnails are omitted before project persistence", () => {
		const source = project();
		source.metadata.thumbnail = `data:image/png;base64,${"A".repeat(200_001)}`;
		const serialized = new StorageService().serializeProject({ project: source });

		expect(serialized.metadata).not.toHaveProperty("thumbnail");
		expect(losslessJson(serialized)).toEqual(serialized);
	});
});
