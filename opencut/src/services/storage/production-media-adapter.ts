import type { EntityStorageApi, FilesStorageApi } from "./sdk-adapter";
import { SdkAdapter, SdkBinaryAdapter } from "./sdk-adapter";
import { projectFolderRef, resolveProjectFolder } from "./project-folder";
import type { MediaAssetData } from "./types";
import type { MediaAsset } from "@/media/types";

const MEDIA_METADATA_ENTITY_TYPE = "opencut.media-metadata";
const MEDIA_FILE_ENTITY_TYPE = "opencut.media-file";

interface ProductionFileLink {
	storageKey: string;
	publicId: string;
	name: string;
	mimeType: string;
	size: number;
	lastModified: number;
}

export interface ProductionMediaImport {
	editId: string;
	mediaId: string;
	mediaRevision: string;
	role: "visual" | "video" | "narration";
	name: string;
	mimeType: "image/png" | "image/jpeg" | "image/webp" | "audio/wav" | "video/mp4" | "video/webm";
	digest: string;
	file: File;
	width?: number;
	height?: number;
	duration?: number;
}

export interface ImportedProductionMedia extends MediaAsset {
	filesRef?: { publicId: string; path: string };
}

export interface ProductionMediaLibrary {
	import(input: ProductionMediaImport): Promise<ImportedProductionMedia>;
	resolve?(editId: string, mediaId: string): Promise<{ publicId: string; path: string } | null>;
}

export interface MountedMediaStore {
	getAssets(): MediaAsset[];
	addMediaAsset(args: {
		projectId: string;
		assetId?: string;
		asset: Omit<MediaAsset, "id">;
	}): Promise<MediaAsset | null>;
}

/**
 * Imports producer-owned bytes through the same Files-backed media store used
 * by the editor. The deterministic media id is keyed by edit, accepted shot,
 * role, and content digest, so the declared metadata/file records are also the
 * replay identity and no extra catalog entity is needed.
 */
export class SdkProductionMediaLibrary implements ProductionMediaLibrary {
	private readonly entities: EntityStorageApi;
	private readonly files: FilesStorageApi;

	constructor({ entities, files }: { entities: EntityStorageApi; files: FilesStorageApi }) {
		this.entities = entities;
		this.files = files;
	}

	async resolve(editId: string, mediaId: string): Promise<{ publicId: string; path: string } | null> {
		const link = await this.fileLinks(editId).get(mediaId);
		if (!link) return null;
		const published = (await this.files.list()).find((entry) => entry.publicId === link.publicId);
		return published ? { publicId: published.publicId, path: published.path } : null;
	}

	async import(input: ProductionMediaImport): Promise<ImportedProductionMedia> {
		const existingAsset = await this.loadAsset(input.editId, input.mediaId);
		if (existingAsset) {
			const published = await this.resolve(input.editId, input.mediaId);
			return published ? { ...existingAsset, filesRef: published } : existingAsset;
		}

		const metadata = new SdkAdapter<MediaAssetData>({
			entityType: MEDIA_METADATA_ENTITY_TYPE,
			keyPrefix: `${input.editId}:`,
			entityApi: this.entities,
		});
		const binaries = new SdkBinaryAdapter({
			entityType: MEDIA_FILE_ENTITY_TYPE,
			keyPrefix: `${input.editId}:`,
			folder: projectFolderRef({ editId: input.editId, section: "Media", entityApi: this.entities }),
			entityApi: this.entities,
			filesApi: this.files,
		});
		const bytes = new Uint8Array(await input.file.arrayBuffer());
		const folder = await resolveProjectFolder({ editId: input.editId, section: "Media", entityApi: this.entities });
		const published = input.file.type
			? await this.files.publish({ content: bytes, name: input.file.name, mimeType: input.file.type, folder })
			: await this.files.publish({ content: bytes, name: input.file.name, folder });
		const filesRef = { publicId: published.publicId, path: published.path };
		await this.fileLinks(input.editId).set({
			key: input.mediaId,
			value: { storageKey: `${input.editId}:${input.mediaId}`, publicId: published.publicId, name: input.file.name, mimeType: input.file.type, size: input.file.size, lastModified: input.file.lastModified },
		});
		const assetMetadata: MediaAssetData = {
			id: input.mediaId,
			name: input.name,
			type: input.role === "narration" ? "audio" : input.role === "video" ? "video" : "image",
			size: input.file.size,
			lastModified: input.file.lastModified,
		};
		if (input.width !== undefined) assetMetadata.width = input.width;
		if (input.height !== undefined) assetMetadata.height = input.height;
		if (input.duration !== undefined) assetMetadata.duration = input.duration;
		await metadata.set({ key: input.mediaId, value: assetMetadata });
		return {
			id: input.mediaId,
			name: input.name,
			type: input.role === "narration" ? "audio" : input.role === "video" ? "video" : "image",
			file: input.file,
			width: input.width,
			height: input.height,
			duration: input.duration,
			filesRef,
		};
	}

	private fileLinks(editId: string): SdkAdapter<ProductionFileLink> {
		return new SdkAdapter<ProductionFileLink>({
			entityType: MEDIA_FILE_ENTITY_TYPE,
			keyPrefix: `${editId}:`,
			entityApi: this.entities,
		});
	}

	private async loadAsset(editId: string, mediaId: string): Promise<MediaAsset | null> {
		const metadata = new SdkAdapter<MediaAssetData>({
			entityType: MEDIA_METADATA_ENTITY_TYPE,
			keyPrefix: `${editId}:`,
			entityApi: this.entities,
		});
		const binaries = new SdkBinaryAdapter({
			entityType: MEDIA_FILE_ENTITY_TYPE,
			keyPrefix: `${editId}:`,
			folder: projectFolderRef({ editId, section: "Media", entityApi: this.entities }),
			entityApi: this.entities,
			filesApi: this.files,
		});
		const [value, file] = await Promise.all([
			metadata.get(mediaId),
			binaries.get(mediaId),
		]);
		if (!value || !file) return null;
		return {
			id: value.id,
			name: value.name,
			type: value.type,
			file,
			width: value.width,
			height: value.height,
			duration: value.duration,
			thumbnailUrl: value.thumbnailUrl,
			ephemeral: value.ephemeral,
		};
	}
}

/**
 * Keeps the durable production media store and the currently mounted editor
 * in sync. The durable adapter owns the Files-backed identity; the editor
 * path only hydrates its in-memory Assets panel with that same stable id.
 */
export class MountedProductionMediaLibrary implements ProductionMediaLibrary {
	constructor(
		private readonly durable: SdkProductionMediaLibrary,
		private readonly mountedMedia: MountedMediaStore,
	) {}

	resolve(editId: string, mediaId: string): Promise<{ publicId: string; path: string } | null> {
		return this.durable.resolve(editId, mediaId);
	}

	async import(input: ProductionMediaImport): Promise<ImportedProductionMedia> {
		const imported = await this.durable.import(input);
		if (this.mountedMedia.getAssets().some((asset) => asset.id === input.mediaId)) return imported;

		const url = URL.createObjectURL(imported.file);
		const mounted = await this.mountedMedia.addMediaAsset({
			projectId: input.editId,
			assetId: input.mediaId,
			asset: {
				name: imported.name,
				type: imported.type,
				file: imported.file,
				url,
				width: imported.width,
				height: imported.height,
				duration: imported.duration,
			},
		});
		if (!mounted) URL.revokeObjectURL(url);
		return imported;
	}
}
