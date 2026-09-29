import type { EditorCore } from "@/core";
import { toast } from "sonner";
import type { MediaAsset } from "@/media/types";
import { readVideoFile } from "@/media/mediabunny";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import { RemoveMediaAssetCommand } from "@/commands";

export class MediaManager {
	private assets: MediaAsset[] = [];
	private isLoading = false;
	private projectId: string | null = null;
	private loadId = 0;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	async addMediaAsset({
		projectId,
		asset,
		assetId,
	}: {
		projectId: string;
		asset: Omit<MediaAsset, "id">;
		assetId?: string;
	}): Promise<MediaAsset | null> {
		if (this.projectId === null && this.editor.project.getActiveOrNull()?.metadata.id === projectId) {
			this.projectId = projectId;
		}
		const newAsset: MediaAsset = {
			...asset,
			id: assetId ?? generateUUID(),
		};

		if (newAsset.type === "video" && !newAsset.thumbnailUrl) {
			try {
				const video = await readVideoFile({ file: newAsset.file });
				if (video.thumbnailUrl) newAsset.thumbnailUrl = video.thumbnailUrl;
			} catch (error) {
				console.error("Failed to generate video thumbnail:", newAsset.id, error);
			}
		}

		if (this.projectId === projectId) {
			this.assets = [...this.assets.filter((item) => item.id !== newAsset.id), newAsset];
			this.notify();
		}

		try {
			await storageService.saveMediaAsset({ projectId, mediaAsset: newAsset });
			if (this.projectId === projectId) {
				this.editor.project.ratchetFpsForImportedMedia({
					importedAssets: [newAsset],
				});
			}
			return newAsset;
		} catch (error) {
			console.error("Failed to save media asset:", error);
			this.assets = this.assets.filter((asset) => asset !== newAsset);
			this.notify();

			if (storageService.isQuotaExceededError({ error })) {
				toast.error("Not enough browser storage", {
					description: error instanceof Error ? error.message : undefined,
				});
			}

			return null;
		}
	}

	removeMediaAsset({ projectId, id }: { projectId: string; id: string }): void {
		this.removeMediaAssets({ projectId, ids: [id] });
	}

	removeMediaAssets({
		projectId,
		ids,
	}: {
		projectId: string;
		ids: string[];
	}): void {
		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length === 0) {
			return;
		}

		const command = new RemoveMediaAssetCommand({ projectId, assetIds: uniqueIds });

		this.editor.command.execute({ command });
	}

	async loadProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		const loadId = ++this.loadId;
		if (this.projectId !== projectId) this.assets = [];
		this.projectId = projectId;
		const initialAssets = new Set(this.assets);
		this.isLoading = true;
		this.notify();

		try {
			const mediaAssets = await storageService.loadAllMediaAssets({
				projectId,
			});
			if (loadId !== this.loadId) {
				for (const asset of mediaAssets) {
					if (asset.url) URL.revokeObjectURL(asset.url);
					if (asset.thumbnailUrl) URL.revokeObjectURL(asset.thumbnailUrl);
				}
				return;
			}
			const addedDuringLoad = this.assets.filter((asset) => !initialAssets.has(asset));
			const merged = new Map(mediaAssets.map((asset) => [asset.id, asset]));
			for (const asset of addedDuringLoad) merged.set(asset.id, asset);
			this.assets = [...merged.values()];
			this.notify();
		} catch (error) {
			console.error("Failed to load media assets:", error);
		} finally {
			if (loadId === this.loadId) {
				this.isLoading = false;
				this.notify();
			}
		}
	}

	async clearProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		if (this.projectId !== projectId) return;
		this.loadId += 1;
		this.isLoading = false;
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		const mediaIds = this.assets.map((asset) => asset.id);
		this.assets = [];
		this.notify();

		try {
			await Promise.all(
				mediaIds.map((id) =>
					storageService.deleteMediaAsset({ projectId, id }),
				),
			);
		} catch (error) {
			console.error("Failed to clear media assets from storage:", error);
		}
	}

	clearAllAssets(): void {
		this.loadId += 1;
		this.projectId = null;
		this.isLoading = false;
		videoCache.clearAll();
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		this.assets = [];
		this.notify();
	}

	getAssets(): MediaAsset[] {
		return this.assets;
	}

	setAssets({ assets }: { assets: MediaAsset[] }): void {
		this.assets = assets;
		this.notify();
	}

	isLoadingMedia(): boolean {
		return this.isLoading;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
