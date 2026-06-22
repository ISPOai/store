import { shared } from "@ispo/sdk";

interface StoredFilePayload {
	schemaVersion: 1;
	name: string;
	mimeType: string;
	encoding: "text" | "data-url";
	content: string;
	savedAt?: string;
}

export interface SharedMediaReadFailure {
	path: string;
	message: string;
}

export interface SharedMediaReadResult {
	files: File[];
	failures: SharedMediaReadFailure[];
}

const MEDIA_EXTENSIONS = new Map<string, string>([
	["aac", "audio/aac"],
	["aif", "audio/aiff"],
	["aiff", "audio/aiff"],
	["avif", "image/avif"],
	["flac", "audio/flac"],
	["gif", "image/gif"],
	["jpeg", "image/jpeg"],
	["jpg", "image/jpeg"],
	["m4a", "audio/mp4"],
	["m4v", "video/mp4"],
	["mov", "video/quicktime"],
	["mp3", "audio/mpeg"],
	["mp4", "video/mp4"],
	["oga", "audio/ogg"],
	["ogg", "audio/ogg"],
	["ogv", "video/ogg"],
	["png", "image/png"],
	["svg", "image/svg+xml"],
	["wav", "audio/wav"],
	["webm", "video/webm"],
	["webp", "image/webp"],
]);

export function isSharedMediaCandidate(path: string): boolean {
	if (path.endsWith("/")) return false;
	const extension = extensionForPath(path);
	return extension === "json" || MEDIA_EXTENSIONS.has(extension);
}

export async function readSharedMediaFiles(
	paths: string[],
): Promise<SharedMediaReadResult> {
	const files: File[] = [];
	const failures: SharedMediaReadFailure[] = [];

	for (const path of paths) {
		try {
			files.push(await readSharedMediaFile(path));
		} catch (error) {
			failures.push({
				path,
				message: error instanceof Error ? error.message : "Could not read file",
			});
		}
	}

	return { files, failures };
}

async function readSharedMediaFile(path: string): Promise<File> {
	const raw = await shared.read(path);
	const payload = parseStoredFilePayload(raw);

	if (payload) {
		return fileFromStoredPayload({ payload, fallbackName: basename(path) });
	}

	const trimmed = raw.trimStart();
	if (trimmed.startsWith("data:")) {
		return fileFromDataUrl({
			dataUrl: trimmed,
			name: basename(path),
			fallbackType: mimeTypeForPath(path),
		});
	}

	const mimeType = mimeTypeForPath(path);
	if (mimeType === "image/svg+xml" || trimmed.startsWith("<svg")) {
		return new File([raw], basename(path), {
			type: "image/svg+xml",
			lastModified: Date.now(),
		});
	}

	// Reached here means none of the text payload shapes matched. If the
	// extension claims a binary media type (mp4/mp3/wav/png…, but not the
	// text-based svg), the file is almost certainly raw bytes — and the host
	// SDK has no shared.readBinary, so shared.read returned a mangled UTF-8
	// string we can't turn back into the original media. Say so, and point at
	// the import path that does carry real bytes.
	const extension = extensionForPath(path);
	if (MEDIA_EXTENSIONS.has(extension) && extension !== "svg") {
		throw new Error(
			"looks like a raw binary file. Shared-file import can only read text-encoded payloads (the host SDK has no binary read) — drag it onto the timeline from your file browser instead.",
		);
	}

	throw new Error("Shared file is not a supported media payload");
}

function fileFromStoredPayload({
	payload,
	fallbackName,
}: {
	payload: StoredFilePayload;
	fallbackName: string;
}): File {
	const name = payload.name || fallbackName;
	const type = payload.mimeType || mimeTypeForPath(name) || "";
	const savedAt = payload.savedAt ? new Date(payload.savedAt).getTime() : NaN;
	const lastModified = Number.isFinite(savedAt) ? savedAt : Date.now();

	if (!isMediaMimeType(type)) {
		throw new Error(`${name} is not an image, video, or audio file`);
	}

	if (payload.encoding === "data-url") {
		return fileFromDataUrl({
			dataUrl: payload.content,
			name,
			fallbackType: type,
			lastModified,
		});
	}

	if (type !== "image/svg+xml") {
		throw new Error(`${name} is not a supported shared media payload`);
	}

	return new File([payload.content], name, {
		type,
		lastModified,
	});
}

function parseStoredFilePayload(raw: string): StoredFilePayload | null {
	if (!raw.trimStart().startsWith("{")) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== "object") return null;
	const value = parsed as Partial<StoredFilePayload>;
	if (value.schemaVersion !== 1) return null;
	if (typeof value.name !== "string") return null;
	if (typeof value.mimeType !== "string") return null;
	if (value.encoding !== "text" && value.encoding !== "data-url") return null;
	if (typeof value.content !== "string") return null;
	if (value.savedAt !== undefined && typeof value.savedAt !== "string") {
		return null;
	}

	return {
		schemaVersion: 1,
		name: value.name,
		mimeType: value.mimeType,
		encoding: value.encoding,
		content: value.content,
		savedAt: value.savedAt,
	};
}

function fileFromDataUrl({
	dataUrl,
	name,
	fallbackType,
	lastModified = Date.now(),
}: {
	dataUrl: string;
	name: string;
	fallbackType?: string;
	lastModified?: number;
}): File {
	const commaIndex = dataUrl.indexOf(",");
	if (commaIndex === -1) {
		throw new Error(`${name} has an invalid data URL payload`);
	}

	const header = dataUrl.slice(0, commaIndex);
	const body = dataUrl.slice(commaIndex + 1);
	const headerType = header.match(/^data:([^;,]*)/)?.[1] || "";
	const mimeType = isMediaMimeType(headerType)
		? headerType
		: fallbackType || headerType;

	if (!isMediaMimeType(mimeType)) {
		throw new Error(`${name} is not an image, video, or audio file`);
	}

	if (header.includes(";base64")) {
		const binary = window.atob(body);
		const buffer = new ArrayBuffer(binary.length);
		const bytes = new Uint8Array(buffer);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return new File([buffer], name, { type: mimeType, lastModified });
	}

	return new File([decodeURIComponent(body)], name, {
		type: mimeType,
		lastModified,
	});
}

function isMediaMimeType(value: string): boolean {
	return (
		value.startsWith("image/") ||
		value.startsWith("video/") ||
		value.startsWith("audio/")
	);
}

function mimeTypeForPath(path: string): string | undefined {
	return MEDIA_EXTENSIONS.get(extensionForPath(path));
}

function extensionForPath(path: string): string {
	const name = basename(path);
	const index = name.lastIndexOf(".");
	return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function basename(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? "shared-media";
}
