import { describe, expect, test } from "bun:test";
import { getExportFileName } from "@/export";

describe("getExportFileName", () => {
	test("does not duplicate an output extension", () => {
		expect(
			getExportFileName({ name: "w12-live-r42-export-1.mp4", format: "mp4" }),
		).toBe("w12-live-r42-export-1.mp4");
	});

	test("adds the output extension when it is missing", () => {
		expect(
			getExportFileName({ name: "w12-live-r42-export-1", format: "mp4" }),
		).toBe("w12-live-r42-export-1.mp4");
	});
});
