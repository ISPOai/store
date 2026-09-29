import { describe, expect, test } from "bun:test";
import type { FilesListEntry, HostApi } from "@ispo/sdk";
import { collectCloudFile } from "./cloud-job-files";

async function fixture(overrides: { files?: { state: "completed" | "failed"; artifacts: Array<{ publicId: string; path: string; mimeType: string; digest: string; byteLength: number }>; message?: string } } = {}): Promise<Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>> {
	const bytes = new Uint8Array([1, 2, 3, 4]);
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
	// SAFETY: this fixture contains the required succeeded Cloud job fields and is used only as a test response.
	return { state: "succeeded", jobRef: "job-1", model: { modelKey: "m", modelVersion: "1" }, artifacts: [{ artifactRef: "a", kind: "image", mediaType: "image/png", sha256: digest, byteLength: 4, dimensions: { width: 1, height: 1 } }], files: { state: "completed", artifacts: [{ publicId: "file-1", path: "OpenCut/file.png", mimeType: "image/png", digest, byteLength: 4 }] }, ...overrides } as Awaited<ReturnType<HostApi["cloudJobs"]["get"]>>;
}

function files(): FilesListEntry[] {
	return [{ publicId: "file-1", path: "OpenCut/file.png", name: "file.png", mimeType: "image/png", size: 4, folder: "OpenCut", kind: "image", url: "data:image/png;base64,AQIDBA==" }];
}

describe("Cloud Files artifact collection", () => {
	test("fails closed for ambiguous metadata and downloaded bytes", async () => {
		const oldFetch = globalThis.fetch;
		globalThis.fetch = async () => new Response(new Uint8Array([9, 9, 9, 9]));
		try {
			await expect(collectCloudFile(await fixture({ files: { state: "completed", artifacts: [{ publicId: "file-1", path: "OpenCut/file.png", mimeType: "image/png", digest: "bad", byteLength: 4 }, { publicId: "file-2", path: "OpenCut/file-2.png", mimeType: "image/png", digest: "bad", byteLength: 4 }] } }), files, "image", "image/png")).rejects.toThrow();
		} finally { globalThis.fetch = oldFetch; }
	});

	test("rejects a succeeded job whose Files projection failed", async () => {
		const job = await fixture({ files: { state: "failed", artifacts: [], message: "still materializing" } });
		await expect(collectCloudFile(job, files, "image", "image/png")).rejects.toThrow(/Files projection/);
	});
});
