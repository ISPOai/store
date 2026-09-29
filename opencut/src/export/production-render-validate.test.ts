import { describe, expect, test } from "bun:test";
import { validateProductionRender } from "./production-render-validate";

describe("production render validation", () => {
	test("rejects an empty result before it can be published as complete", async () => {
		await expect(
			validateProductionRender({
				buffer: new Uint8Array(),
				format: "mp4",
				expectedWidth: 1920,
				expectedHeight: 1080,
				expectedDurationSeconds: 1,
				expectedAudio: false,
				captions: [],
			}),
		).rejects.toThrow("produced no bytes");
	});
});
