import { fs } from "@ispo/sdk";
import type { StorageAdapter } from "./types";

// ───────────────────────────────────────────────────────────────────────────
// ISPO SDK-backed storage adapters.
//
// These replace `IndexedDBAdapter` (JSON values) and `OPFSAdapter` (binary
// blobs) by routing every read/write through `@ispo/sdk`'s `fs` surface
// against the project's scoped data root (~/ISPO/opencut/data/).
//
// Path scheme
//   The SDK fs is path-based; the OpenCut storage layer is key-based. We map
//   key → `<directory>/<key>.json` for SdkAdapter (so the user sees readable
//   JSON files in Finder under ~/ISPO/opencut/data/) and key → `<directory>/<key>`
//   for SdkBinaryAdapter (no extension; opaque blob).
//
// Error translation
//   SDK fs.read/fs.readBinary THROW on missing files, but the OpenCut
//   StorageAdapter<T> contract returns `null`. Each get() catches the
//   not-found error and translates; any other error propagates.
//
// File wrapping (binary only)
//   OPFSAdapter is typed `StorageAdapter<File>` — callers consume a browser
//   File object. The SDK delivers Uint8Array, so SdkBinaryAdapter wraps
//   bytes in `new File([bytes], key, ...)`. We don't have lastModified or
//   MIME type from the SDK side; the synthesized File carries `Date.now()`
//   and an empty type. Inspect the actual callers under `src/media/` if
//   either field turns out to matter.
//
// Atomicity
//   fs.write / fs.writeBinary are atomic on the host side (tmp + rename),
//   so set() is safe under crashes. We do NOT need a write lock.
// ───────────────────────────────────────────────────────────────────────────

// SDK fs.read throws on missing files. The underlying scoped-fs guard emits
// messages containing "project file not found:" or "project directory not found:".
// When the call crosses Electron IPC the message gets wrapped as
//   "Error invoking remote method 'project-call': Error: project file not found: foo"
// and — depending on how the SDK re-throws — may arrive as a non-Error value
// (string, plain object) rather than an actual Error instance. Match on the
// message field directly without an `instanceof` gate.
function errorMessage(err: unknown): string {
	if (err == null) return "";
	if (typeof err === "string") return err;
	const candidate = (err as { message?: unknown }).message;
	return typeof candidate === "string" ? candidate : String(err);
}

function isFileNotFound(err: unknown): boolean {
	return errorMessage(err).includes("project file not found:");
}

function isDirNotFound(err: unknown): boolean {
	return errorMessage(err).includes("project directory not found:");
}

// ───────────────────────────────────────────────────────────────────────────
// SdkAdapter<T> — JSON-serialized values via fs.read / fs.write.
// Mirrors IndexedDBAdapter's public surface.
// ───────────────────────────────────────────────────────────────────────────

export interface SdkAdapterOptions {
	/** Subdirectory under the project data root, e.g. "projects" or "saved-sounds". */
	directory: string;
}

export class SdkAdapter<T> implements StorageAdapter<T> {
	private readonly directory: string;

	constructor(options: SdkAdapterOptions) {
		// Normalize trailing slash so pathFor() can concatenate without thinking.
		this.directory = options.directory.replace(/\/+$/, "");
	}

	/** Map a logical key to the on-disk JSON path. */
	private pathFor(key: string): string {
		return `${this.directory}/${key}.json`;
	}

	/**
	 * Worked example: shows the path mapping + JSON serialization pattern that
	 * the other methods follow. fs.write is atomic on the host side, so we
	 * don't need a tmp-and-rename dance here.
	 */
	async set({ key, value }: { key: string; value: T }): Promise<void> {
		await fs.write(this.pathFor(key), JSON.stringify(value));
	}

	async get(key: string): Promise<T | null> {
		let text: string;
		try {
			text = await fs.read(this.pathFor(key));
		} catch (err) {
			if (isFileNotFound(err)) return null;
			throw err;
		}
		return JSON.parse(text) as T;
	}

	async remove(key: string): Promise<void> {
		await fs.delete(this.pathFor(key));
	}

	async list(): Promise<string[]> {
		let entries: string[];
		try {
			entries = await fs.list(this.directory);
		} catch (err) {
			if (isDirNotFound(err)) return [];
			throw err;
		}
		return entries
			.filter((name) => name.endsWith(".json") && !name.endsWith("/"))
			.map((name) => name.slice(0, -".json".length));
	}

	async clear(): Promise<void> {
		const keys = await this.list();
		await Promise.all(keys.map((key) => this.remove(key)));
	}
}

// ───────────────────────────────────────────────────────────────────────────
// SdkBinaryAdapter — binary blobs via fs.readBinary / fs.writeBinary.
// Mirrors OPFSAdapter's public surface (StorageAdapter<File>).
// ───────────────────────────────────────────────────────────────────────────

export class SdkBinaryAdapter implements StorageAdapter<File> {
	private readonly directory: string;

	constructor(directory: string) {
		this.directory = directory.replace(/\/+$/, "");
	}

	/** Binary keys carry no extension — the file IS the value. */
	private pathFor(key: string): string {
		return `${this.directory}/${key}`;
	}

	/**
	 * Worked example: shows the File-to-Uint8Array conversion at the write
	 * boundary. `await file.arrayBuffer()` materializes the whole file; that's
	 * fine for the import flow (one-shot writes after the user picks a clip)
	 * but would be wrong for streaming. The SDK fs surface is full-file
	 * anyway, so streaming would need a different SDK extension.
	 */
	async set({ key, value }: { key: string; value: File }): Promise<void> {
		const bytes = new Uint8Array(await value.arrayBuffer());
		await fs.writeBinary(this.pathFor(key), bytes);
	}

	async get(key: string): Promise<File | null> {
		let bytes: Uint8Array;
		try {
			bytes = await fs.readBinary(this.pathFor(key));
		} catch (err) {
			if (isFileNotFound(err)) return null;
			throw err;
		}
		return new File([bytes], key, { lastModified: Date.now() });
	}

	async remove(key: string): Promise<void> {
		await fs.delete(this.pathFor(key));
	}

	async list(): Promise<string[]> {
		let entries: string[];
		try {
			entries = await fs.list(this.directory);
		} catch (err) {
			if (isDirNotFound(err)) return [];
			throw err;
		}
		return entries.filter((name) => !name.endsWith("/"));
	}

	async clear(): Promise<void> {
		const keys = await this.list();
		await Promise.all(keys.map((key) => this.remove(key)));
	}
}
