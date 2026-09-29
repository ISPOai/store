import { beforeEach, describe, expect, mock, test } from "bun:test";

const toastError = mock(() => {});
const readVideoFile = mock(async () => {
	throw new Error("Color/alpha merge worker error.");
});

mock.module("sonner", () => ({
	toast: {
		error: toastError,
	},
}));

mock.module("@/services/storage/service", () => ({
	storageService: {
		canStoreFile: async () => ({
			canStore: true,
			availableBytes: null,
		}),
	},
}));

mock.module("../mediabunny", () => ({
	readVideoFile,
}));

const { processMediaAssets } = await import("../processing");

describe("processMediaAssets", () => {
	beforeEach(() => {
		toastError.mockClear();
		readVideoFile.mockClear();
	});

	test("does not report a video as processed when media analysis fails", async () => {
		const file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], "transparent.webm", {
			type: "video/webm",
		});

		const result = await processMediaAssets({ files: [file] });

		expect(readVideoFile).toHaveBeenCalledTimes(1);
		expect(result).toEqual([]);
		expect(toastError).toHaveBeenCalledWith("Couldn't process transparent.webm", {
			description: "Color/alpha merge worker error.",
		});
	});
});
