import type { FilesListEntry } from "@ispo/sdk";
import type { CloudJobSucceeded } from "./cloud-job-poll";

export type CloudMediaKind = "image" | "audio" | "video";

type CloudArtifact = CloudJobSucceeded["artifacts"][number];
type FilesArtifact = Extract<CloudJobSucceeded["files"], { state: "completed" }>["artifacts"][number];

export interface CollectedCloudFile {
	cloud: CloudArtifact;
	file: FilesArtifact;
	published: FilesListEntry;
	bytes: Uint8Array;
}

function diagnostic(job: CloudJobSucceeded, kind: CloudMediaKind, classification: string, details: { httpStatus?: number; cloudCount?: number; fileCount?: number; ownerCount?: number } = {}): void {
	console.warn("[opencut.cloud.collection]", {
		diagnosticId: "cloud.collection.artifact-verification",
		phase: "collect",
		state: job.state,
		jobRef: job.jobRef,
		mediaKind: kind,
		classification,
		...details,
	});
}

export async function collectCloudFile(
	job: CloudJobSucceeded,
	listFiles: () => Promise<FilesListEntry[]>,
	kind: CloudMediaKind,
	mimeType: string,
): Promise<CollectedCloudFile> {
	if (job.files.state !== "completed") {
		diagnostic(job, kind, "files-projection-not-completed");
		throw new Error("Cloud job Files projection is not completed.");
	}
	const cloud = job.artifacts.filter((artifact) => artifact.kind === kind && artifact.mediaType === mimeType);
	const files = job.files.artifacts.filter((artifact) => artifact.mimeType === mimeType);
	const matches = cloud.flatMap((cloudArtifact) => files
		.filter((fileArtifact) => fileArtifact.digest === cloudArtifact.sha256 && fileArtifact.byteLength === cloudArtifact.byteLength)
		.map((fileArtifact) => ({ cloud: cloudArtifact, file: fileArtifact })));
	if (matches.length !== 1) {
		diagnostic(job, kind, matches.length === 0 ? "artifact-metadata-mismatch" : "artifact-metadata-ambiguous", { cloudCount: cloud.length, fileCount: files.length });
		throw new Error("Cloud job did not provide one verified media Files artifact.");
	}
	const [match] = matches;
	const published = (await listFiles()).filter((entry) => entry.publicId === match.file.publicId && entry.path === match.file.path && entry.mimeType === mimeType && entry.size === match.file.byteLength);
	if (published.length !== 1 || !published[0]?.url) {
		diagnostic(job, kind, published.length === 0 ? "files-owner-mismatch" : "files-owner-ambiguous", { ownerCount: published.length });
		throw new Error("Cloud job media artifact is not available in this project's Files.");
	}
	const response = await fetch(published[0].url);
	if (!response.ok) {
		diagnostic(job, kind, "files-download-failed", { httpStatus: response.status });
		throw new Error("Cloud job media Files artifact could not be downloaded.");
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer)), (byte) => byte.toString(16).padStart(2, "0")).join("");
	if (digest !== match.file.digest || bytes.byteLength !== match.file.byteLength) {
		diagnostic(job, kind, "files-content-mismatch");
		throw new Error("Cloud job media Files bytes failed integrity validation.");
	}
	return { ...match, published: published[0], bytes };
}
