import type { TProject, TProjectMetadata } from "@/project/types";
import { ProductionDocumentService } from "@/project/production-document-service";
import type {
	EditRevision,
	LoadedProductionDocument,
} from "@/project/production-types";
import { getProjectDurationFromScenes } from "@/timeline/scenes";
import type { MediaAsset } from "@/media/types";
import { readVideoFile } from "@/media/mediabunny";
import { SdkAdapter, SdkBinaryAdapter } from "./sdk-adapter";
import { projectFolderRef, rememberProjectName } from "./project-folder";
import {
	type StorageCapacityCheckResult,
	StorageQuotaExceededError,
	evaluateStorageCapacity,
	isStorageQuotaExceededError,
	readStorageQuotaStatus,
} from "./quota";
import type {
	MediaAssetData,
	StorageConfig,
	SerializedProject,
	SerializedProjectMetadata,
	SerializedScene,
} from "./types";
import { localSoundEffectById } from "@/sounds/local-effects";
import type { SavedSoundsData, SavedSound, SoundEffect } from "@/sounds/types";
import type { SavedLutsData, SavedLut } from "@/effects/lut/types";
import {
	migrations,
	runStorageMigrations,
} from "@/services/storage/migrations";
import type { Bookmark, SceneTracks } from "@/timeline";
import { roundMediaTime } from "@/wasm";
import { z } from "zod";
import { entities } from "@ispo/sdk";

const MEDIA_METADATA_ENTITY_TYPE = "opencut.media-metadata";
const MEDIA_FILE_ENTITY_TYPE = "opencut.media-file";
const SAVED_SOUNDS_ENTITY_TYPE = "opencut.saved-sounds";
const LUT_ENTITY_TYPE = "opencut.lut";
const MEDIA_FILES_FOLDER = "Media";
// Thumbnails are derived presentation data. Keep the one current copy bounded
// while production history stores no thumbnail bytes at all.
const PROJECT_THUMBNAIL_MAX_LENGTH = 200_000;

function normalizeProjectThumbnail(
	value: TProjectMetadata["thumbnail"],
): string | undefined {
	const parsed = z
		.string()
		.max(PROJECT_THUMBNAIL_MAX_LENGTH)
		.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

function normalizeBookmarks({ raw }: { raw: unknown }): Bookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): Bookmark | null => {
			if (typeof item === "number") {
				return { time: roundMediaTime({ time: item }) };
			}
			const obj = item as Record<string, unknown>;
			if (
				typeof obj !== "object" ||
				obj === null ||
				typeof obj.time !== "number"
			) {
				return null;
			}
			return {
				time: roundMediaTime({ time: obj.time }),
				...(typeof obj.note === "string" && { note: obj.note }),
				...(typeof obj.color === "string" && { color: obj.color }),
				...(typeof obj.duration === "number" && {
					duration: roundMediaTime({ time: obj.duration }),
				}),
			};
		})
		.filter((b): b is Bookmark => b !== null);
}

class StorageService {
	private documents: ProductionDocumentService;
	private savedSoundsAdapter: SdkAdapter<SavedSoundsData>;
	private lutAdapter: SdkAdapter<SavedLutsData>;
	private config: StorageConfig;
	private migrationsPromise: Promise<void> | null = null;

	constructor({
		documents = new ProductionDocumentService(),
	}: {
		documents?: ProductionDocumentService;
	} = {}) {
		this.config = {
			projectsDb: "video-editor-projects",
			mediaDb: "video-editor-media",
			savedSoundsDb: "video-editor-saved-sounds",
			version: 1,
		};

		this.documents = documents;
		this.savedSoundsAdapter = new SdkAdapter<SavedSoundsData>({
			entityType: SAVED_SOUNDS_ENTITY_TYPE,
		});
		this.lutAdapter = new SdkAdapter<SavedLutsData>({
			entityType: LUT_ENTITY_TYPE,
		});
	}

	private async ensureMigrations(): Promise<void> {
		if (this.migrationsPromise) {
			await this.migrationsPromise;
			return;
		}

		this.migrationsPromise = runStorageMigrations({ migrations }).then(
			() => undefined,
		);
		await this.migrationsPromise;
	}

	private getProjectMediaAdapters({ projectId }: { projectId: string }) {
		const mediaMetadataAdapter = new SdkAdapter<MediaAssetData>({
			entityType: MEDIA_METADATA_ENTITY_TYPE,
			keyPrefix: `${projectId}:`,
		});

		const mediaAssetsAdapter = new SdkBinaryAdapter({
			entityType: MEDIA_FILE_ENTITY_TYPE,
			keyPrefix: `${projectId}:`,
			folder: projectFolderRef({ editId: projectId, section: "Media" }),
		});

		return { mediaMetadataAdapter, mediaAssetsAdapter };
	}

	async canStoreFile({
		size,
	}: {
		size: number;
	}): Promise<StorageCapacityCheckResult> {
		const quotaStatus = await readStorageQuotaStatus();
		return evaluateStorageCapacity({
			requiredBytes: size,
			quotaStatus,
		});
	}

	isQuotaExceededError({ error }: { error: unknown }): boolean {
		return isStorageQuotaExceededError({ error });
	}

	private stripAudioBuffers({ tracks }: { tracks: SceneTracks }): SceneTracks {
		return {
			...tracks,
			audio: tracks.audio.map((track) => ({
				...track,
				elements: track.elements.map((element) => {
					const { buffer: _buffer, ...rest } = element;
					return rest;
				}),
			})),
		};
	}

	serializeProject({ project }: { project: TProject }): SerializedProject {
		const duration =
			project.metadata.duration ??
			getProjectDurationFromScenes({ scenes: project.scenes });
		const serializedScenes: SerializedScene[] = project.scenes.map((scene) => ({
			...scene,
			tracks: this.stripAudioBuffers({ tracks: scene.tracks }),
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		}));
		const thumbnail = normalizeProjectThumbnail(project.metadata.thumbnail);
		const metadata: SerializedProjectMetadata = {
			id: project.metadata.id,
			name: project.metadata.name,
			duration,
			createdAt: project.metadata.createdAt.toISOString(),
			updatedAt: project.metadata.updatedAt.toISOString(),
		};
		if (thumbnail !== undefined) metadata.thumbnail = thumbnail;
		const serializedProject: SerializedProject = {
			metadata,
			scenes: serializedScenes,
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			version: project.version,
		};
		if (project.timelineViewState !== undefined) {
			serializedProject.timelineViewState = project.timelineViewState;
		}

		return serializedProject;
	}

	async importLegacyProject({
		id,
		project,
	}: {
		id: string;
		project: SerializedProject;
	}): Promise<boolean> {
		if (await this.documents.load(id)) return false;
		await this.documents.save({ editId: id, project, expectedRevision: null });
		return true;
	}

	async importLegacySavedSounds({
		value,
	}: {
		value: SavedSoundsData;
	}): Promise<boolean> {
		return this.savedSoundsAdapter.setIfAbsent({
			key: "user-sounds",
			value,
		});
	}

	async importLegacyMediaAsset({
		projectId,
		assetId,
		metadata,
		bytes,
	}: {
		projectId: string;
		assetId: string;
		metadata: MediaAssetData;
		bytes: Uint8Array;
	}): Promise<boolean> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });
		const metadataImported = await mediaMetadataAdapter.setIfAbsent({
			key: assetId,
			value: metadata,
		});

		const content = new Uint8Array(bytes.byteLength);
		content.set(bytes);
		const file = new File([content.buffer], metadata.name, {
			lastModified: metadata.lastModified,
		});
		const fileImported = await mediaAssetsAdapter.setIfAbsent({
			key: assetId,
			value: file,
		});

		return metadataImported || fileImported;
	}

	async saveProject({
		project,
		expectedRevision = null,
		intent = "user",
	}: {
		project: TProject;
		expectedRevision?: EditRevision | null;
		intent?: "user" | "derived";
	}): Promise<LoadedProductionDocument> {
		rememberProjectName({
			editId: project.metadata.id,
			name: project.metadata.name,
		});
		return this.documents.save({
			editId: project.metadata.id,
			project: this.serializeProject({ project }),
			expectedRevision,
			intent,
		});
	}

	async loadProject({
		id,
	}: {
		id: string;
	}): Promise<{ project: TProject; revision: EditRevision } | null> {
		await this.ensureMigrations();
		const document = await this.documents.load(id);
		if (!document) return null;
		const serializedProject = document.project;

		if (
			typeof serializedProject !== "object" ||
			serializedProject === null ||
			typeof serializedProject.metadata !== "object" ||
			serializedProject.metadata === null
		) {
			console.warn(
				"[storage] Skipping malformed project entry (missing metadata):",
				{ id, entry: serializedProject },
			);
			return null;
		}

		const scenes =
			serializedProject.scenes?.map((scene) => ({
				...scene,
				bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
				createdAt: new Date(scene.createdAt),
				updatedAt: new Date(scene.updatedAt),
			})) ?? [];

		const thumbnail = normalizeProjectThumbnail(serializedProject.metadata.thumbnail);
		const metadata: TProjectMetadata = {
			id: serializedProject.metadata.id,
			name: serializedProject.metadata.name,
			duration: roundMediaTime({
				time:
					serializedProject.metadata.duration ??
					getProjectDurationFromScenes({ scenes }),
			}),
			createdAt: new Date(serializedProject.metadata.createdAt),
			updatedAt: new Date(serializedProject.metadata.updatedAt),
		};
		if (thumbnail !== undefined) metadata.thumbnail = thumbnail;
		const project: TProject = {
			metadata,
			scenes,
			currentSceneId: serializedProject.currentSceneId || "",
			settings: serializedProject.settings,
			version: serializedProject.version,
		};
		if (serializedProject.timelineViewState !== undefined) {
			project.timelineViewState = serializedProject.timelineViewState;
		}

		return { project, revision: document.revision };
	}

	subscribeProject({
		id,
		onChange,
	}: {
		id: string;
		onChange: (value: { project: TProject; revision: EditRevision }) => void;
	}): () => void {
		const subscription = this.documents.subscribe(id, () => {
			void this.loadProject({ id }).then((result) => {
				if (result) onChange(result);
			}, (error) => console.error("Failed to refresh project:", error));
		});
		return () => subscription.close();
	}

	async loadAllProjects(): Promise<TProject[]> {
		const projectIds = await this.documents.list();
		const projects: TProject[] = [];

		for (const id of projectIds) {
			const result = await this.loadProject({ id });
			if (result?.project) {
				projects.push(result.project);
			}
		}

		return projects.sort(
			(a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime(),
		);
	}

	async loadAllProjectsMetadata(): Promise<TProjectMetadata[]> {
		const summaries = await this.documents.listEditMetadata();
		const metadata: TProjectMetadata[] = [];
		for (const summary of summaries) {
			const item: TProjectMetadata = {
				id: summary.metadata.id,
				name: summary.metadata.name,
				duration: roundMediaTime({ time: summary.metadata.duration ?? 0 }),
				createdAt: new Date(summary.metadata.createdAt),
				updatedAt: new Date(summary.metadata.updatedAt),
			};
			const thumbnail = normalizeProjectThumbnail(summary.metadata.thumbnail);
			if (thumbnail !== undefined) item.thumbnail = thumbnail;
			metadata.push(item);
		}
		return metadata.sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}

	async deleteProject({ id }: { id: string }): Promise<void> {
		await this.documents.remove(id);
	}

	async saveMediaAsset({
		projectId,
		mediaAsset,
	}: {
		projectId: string;
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const metadata: MediaAssetData = {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			size: mediaAsset.file.size,
			lastModified: mediaAsset.file.lastModified,
		};
		if (mediaAsset.width !== undefined) metadata.width = mediaAsset.width;
		if (mediaAsset.height !== undefined) metadata.height = mediaAsset.height;
		if (mediaAsset.duration !== undefined) metadata.duration = mediaAsset.duration;
		if (mediaAsset.thumbnailUrl !== undefined) metadata.thumbnailUrl = mediaAsset.thumbnailUrl;
		if (mediaAsset.ephemeral !== undefined) metadata.ephemeral = mediaAsset.ephemeral;

		try {
			await mediaAssetsAdapter.set({
				key: mediaAsset.id,
				value: mediaAsset.file,
			});
			await mediaMetadataAdapter.set({
				key: mediaAsset.id,
				value: metadata,
			});
		} catch (error) {
			try {
				await mediaAssetsAdapter.remove(mediaAsset.id);
			} catch {
				// Ignore cleanup failures so the original storage error is preserved.
			}

			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: mediaAsset.file.size,
				});
			}

			throw error;
		}
	}

	async loadMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<MediaAsset | null> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const [file, metadata] = await Promise.all([
			mediaAssetsAdapter.get(id),
			mediaMetadataAdapter.get(id),
		]);

		if (!file || !metadata) return null;

		// Older production imports did not generate a preview. Repair only the
		// derived metadata, preserving the existing Files and production identity.
		if (metadata.type === "video" && !metadata.thumbnailUrl) {
			try {
				const video = await readVideoFile({ file });
				if (video.thumbnailUrl) {
					metadata.thumbnailUrl = video.thumbnailUrl;
					await mediaMetadataAdapter.set({ key: id, value: metadata });
				}
			} catch (error) {
				console.error("Failed to restore video thumbnail:", id, error);
			}
		}

		let url: string;
		if (metadata.type === "image" && (!file.type || file.type === "")) {
			try {
				const text = await file.text();
				if (text.trim().startsWith("<svg")) {
					const svgBlob = new Blob([text], { type: "image/svg+xml" });
					url = URL.createObjectURL(svgBlob);
				} else {
					url = URL.createObjectURL(file);
				}
			} catch {
				url = URL.createObjectURL(file);
			}
		} else {
			url = URL.createObjectURL(file);
		}

		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file,
			url,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			thumbnailUrl: metadata.thumbnailUrl,
			ephemeral: metadata.ephemeral,
		};
	}

	async loadAllMediaAssets({
		projectId,
	}: {
		projectId: string;
	}): Promise<MediaAsset[]> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		// Three bulk reads for the whole pass: metadata records, file links, and
		// one Files listing. A per-item read round trip here was the dominant
		// cost of opening a project with media attached.
		const [metadataEntries, links, published] = await Promise.all([
			mediaMetadataAdapter.listEntries(),
			mediaAssetsAdapter.listLinks(),
			mediaAssetsAdapter.listPublishedFiles(),
		]);
		const linkByKey = new Map(links.map((entry) => [entry.key, entry.link]));
		const publishedByPublicId = new Map(
			published.map((entry) => [entry.publicId, entry]),
		);
		const mediaItems: MediaAsset[] = [];

		for (const { key, value: metadata } of metadataEntries) {
			const link = linkByKey.get(key);
			if (!link) continue;
			const publishedEntry = publishedByPublicId.get(link.publicId);
			if (!publishedEntry) continue;

			const response = await fetch(publishedEntry.url);
			if (!response.ok) {
				throw new Error(`Could not load published media: ${publishedEntry.name}`);
			}
			const content = await response.blob();
			const file = new File([content], link.name, {
				type: link.mimeType || content.type,
				lastModified: link.lastModified,
			});

			// Older production imports did not generate a preview. Repair only the
			// derived metadata, preserving the existing Files and production identity.
			if (metadata.type === "video" && !metadata.thumbnailUrl) {
				try {
					const video = await readVideoFile({ file });
					if (video.thumbnailUrl) {
						metadata.thumbnailUrl = video.thumbnailUrl;
						await mediaMetadataAdapter.set({ key, value: metadata });
					}
				} catch (error) {
					console.error("Failed to restore video thumbnail:", key, error);
				}
			}

			let url: string;
			if (metadata.type === "image" && (!file.type || file.type === "")) {
				try {
					const text = await file.text();
					if (text.trim().startsWith("<svg")) {
						const svgBlob = new Blob([text], { type: "image/svg+xml" });
						url = URL.createObjectURL(svgBlob);
					} else {
						url = URL.createObjectURL(file);
					}
				} catch {
					url = URL.createObjectURL(file);
				}
			} else {
				url = URL.createObjectURL(file);
			}

			mediaItems.push({
				id: metadata.id,
				name: metadata.name,
				type: metadata.type,
				file,
				url,
				width: metadata.width,
				height: metadata.height,
				duration: metadata.duration,
				thumbnailUrl: metadata.thumbnailUrl,
				ephemeral: metadata.ephemeral,
			});
		}

		return mediaItems;
	}

	async deleteMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<void> {
		await this.deleteMediaAssets({ projectId, ids: [id] });
	}

	async deleteMediaAssets({ projectId, ids }: { projectId: string; ids: string[] }): Promise<void> {
		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length === 0) return;
		const records: Array<{ type: string; id: string }> = [];
		for (const type of [MEDIA_METADATA_ENTITY_TYPE, MEDIA_FILE_ENTITY_TYPE]) {
			const adapter = new SdkAdapter({ entityType: type, keyPrefix: `${projectId}:` });
			for (const id of uniqueIds) {
				const record = await adapter.readRecord(id);
				if (record) records.push({ type, id: record.id });
			}
		}
		if (records.length > 0) {
			await entities.deleteMany(records, { idempotencyKey: crypto.randomUUID() });
		}
	}

	async deleteProjectMedia({
		projectId,
	}: {
		projectId: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const [metadataRecords, fileLinkRecords] = await Promise.all([
			mediaMetadataAdapter.listRecords(),
			mediaAssetsAdapter.listRecords(),
		]);

		const records = [
			...metadataRecords.map((record) => ({
				type: MEDIA_METADATA_ENTITY_TYPE,
				id: record.id,
			})),
			...fileLinkRecords.map((record) => ({
				type: MEDIA_FILE_ENTITY_TYPE,
				id: record.id,
			})),
		];

		if (records.length > 0) {
			await entities.deleteMany(records, { idempotencyKey: crypto.randomUUID() });
		}
	}

	async clearAllData(): Promise<void> {
		await this.documents.clear();
		// project-specific media and timelines cleaned up when projects are deleted
	}

	async getStorageInfo(): Promise<{
		projects: number;
		isOPFSSupported: boolean;
		isIndexedDBSupported: boolean;
	}> {
		const projectIds = await this.documents.list();

		return {
			projects: projectIds.length,
			isOPFSSupported: this.isOPFSSupported(),
			isIndexedDBSupported: this.isIndexedDBSupported(),
		};
	}

	async getProjectStorageInfo({ projectId }: { projectId: string }): Promise<{
		mediaItems: number;
	}> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();

		return {
			mediaItems: mediaIds.length,
		};
	}

	async loadSavedSounds(): Promise<SavedSoundsData> {
		try {
			const savedSoundsData = await this.savedSoundsAdapter.get("user-sounds");
			if (!savedSoundsData) {
				return { sounds: [], lastModified: new Date().toISOString() };
			}
			// The saved-sounds entity schema is frozen at v1 (host entity schemas
			// cannot change existing properties), so `kind` is never persisted.
			// Local synthesized effects have stable ids, so derive it on read.
			return {
				...savedSoundsData,
				sounds: savedSoundsData.sounds.map((sound) => {
					const kind = localSoundEffectById(sound.id)?.kind;
					return kind !== undefined ? { ...sound, kind } : sound;
				}),
			};
		} catch (error) {
			console.error("Failed to load saved sounds:", error);
			return { sounds: [], lastModified: new Date().toISOString() };
		}
	}

	async saveSoundEffect({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			if (currentData.sounds.some((sound) => sound.id === soundEffect.id)) {
				return; // Already saved
			}

			const savedSound: SavedSound = {
				id: soundEffect.id,
				name: soundEffect.name,
				username: soundEffect.username,
				previewUrl: soundEffect.previewUrl,
				downloadUrl: soundEffect.downloadUrl,
				duration: soundEffect.duration,
				tags: soundEffect.tags,
				license: soundEffect.license,
				savedAt: new Date().toISOString(),
			};

			const updatedData: SavedSoundsData = {
				sounds: [...currentData.sounds, savedSound],
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to save sound effect:", error);
			throw error;
		}
	}

	async removeSavedSound({ soundId }: { soundId: number }): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			const updatedData: SavedSoundsData = {
				sounds: currentData.sounds.filter((sound) => sound.id !== soundId),
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to remove saved sound:", error);
			throw error;
		}
	}

	async isSoundSaved({ soundId }: { soundId: number }): Promise<boolean> {
		try {
			const currentData = await this.loadSavedSounds();
			return currentData.sounds.some((sound) => sound.id === soundId);
		} catch (error) {
			console.error("Failed to check if sound is saved:", error);
			return false;
		}
	}

	async clearSavedSounds(): Promise<void> {
		try {
			await this.savedSoundsAdapter.remove("user-sounds");
		} catch (error) {
			console.error("Failed to clear saved sounds:", error);
			throw error;
		}
	}

	async loadLuts(): Promise<SavedLutsData> {
		try {
			const data = await this.lutAdapter.get("user-luts");
			return data || { luts: [], lastModified: new Date().toISOString() };
		} catch (error) {
			console.error("Failed to load LUTs:", error);
			return { luts: [], lastModified: new Date().toISOString() };
		}
	}

	async saveLut({ lut }: { lut: SavedLut }): Promise<void> {
		try {
			const current = await this.loadLuts();
			const existing = current.luts.find((candidate) => candidate.id === lut.id);
			const luts = existing
				? current.luts.map((candidate) => (candidate.id === lut.id ? lut : candidate))
				: [...current.luts, lut];
			await this.lutAdapter.set({
				key: "user-luts",
				value: { luts, lastModified: new Date().toISOString() },
			});
		} catch (error) {
			console.error("Failed to save LUT:", error);
			throw error;
		}
	}

	async removeLut({ id }: { id: string }): Promise<void> {
		try {
			const current = await this.loadLuts();
			await this.lutAdapter.set({
				key: "user-luts",
				value: {
					luts: current.luts.filter((lut) => lut.id !== id),
					lastModified: new Date().toISOString(),
				},
			});
		} catch (error) {
			console.error("Failed to remove LUT:", error);
			throw error;
		}
	}

	isOPFSSupported(): boolean {
		// Kept under the vendored upstream method name to avoid touching callers.
		// Durable state now uses Entities, while media bytes use Files.
		return true;
	}

	isIndexedDBSupported(): boolean {
		return "indexedDB" in window;
	}

	isFullySupported(): boolean {
		return this.isIndexedDBSupported() && this.isOPFSSupported();
	}
}

export const storageService = new StorageService();
export { StorageService };
