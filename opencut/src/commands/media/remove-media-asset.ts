import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { buildWaveformSourceKey } from "@/media/waveform-summary";
import { storageService } from "@/services/storage/service";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import { hasMediaId } from "@/timeline/element-utils";
import type { SceneTracks } from "@/timeline";

export class RemoveMediaAssetCommand extends Command {
	private savedAssets: MediaAsset[] | null = null;
	private savedTracks: SceneTracks | null = null;
	private removedAssets: MediaAsset[] = [];

	constructor(input: { projectId: string } & ({ assetId: string } | { assetIds: string[] })) {
		super();
		this.projectId = input.projectId;
		this.assetIds = new Set("assetIds" in input ? input.assetIds : [input.assetId]);
	}

	private projectId: string;
	private assetIds: Set<string>;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const assets = editor.media.getAssets();

		this.savedAssets = [...assets];
		this.savedTracks = editor.scenes.getActiveScene().tracks;

		this.removedAssets = assets.filter((media) => this.assetIds.has(media.id));
		if (this.removedAssets.length !== this.assetIds.size) {
			throw new Error("One or more selected media assets no longer exist");
		}

		for (const asset of this.removedAssets) {
			if (asset.url) URL.revokeObjectURL(asset.url);
			if (asset.thumbnailUrl) URL.revokeObjectURL(asset.thumbnailUrl);
			videoCache.clearVideo({ mediaId: asset.id });
			waveformCache.clearSource({ sourceKey: buildWaveformSourceKey({ kind: "media", id: asset.id }) });
		}
		editor.media.setAssets({ assets: assets.filter((media) => !this.assetIds.has(media.id)) });

		const elementsToRemove: Array<{ trackId: string; elementId: string }> = [];

		for (const track of [
			...this.savedTracks.overlay,
			this.savedTracks.main,
			...this.savedTracks.audio,
		]) {
			for (const element of track.elements) {
				if (hasMediaId(element) && this.assetIds.has(element.mediaId)) {
					elementsToRemove.push({ trackId: track.id, elementId: element.id });
				}
			}
		}

		if (elementsToRemove.length > 0) {
			editor.timeline.deleteElements({ elements: elementsToRemove });
		}

		storageService
			.deleteMediaAssets({ projectId: this.projectId, ids: [...this.assetIds] })
			.catch((error) => {
				console.error("Failed to delete media item:", error);
			});
		return undefined;
	}

	undo(): void {
		const editor = EditorCore.getInstance();

		if (this.savedAssets) {
			const restoredAssets = this.savedAssets.map((asset) => this.assetIds.has(asset.id)
				? { ...asset, url: URL.createObjectURL(asset.file) }
				: asset);
			editor.media.setAssets({ assets: restoredAssets });
			for (const asset of restoredAssets.filter((item) => this.assetIds.has(item.id))) {
				storageService.saveMediaAsset({ projectId: this.projectId, mediaAsset: asset })
					.catch((error) => console.error("Failed to restore media item on undo:", error));
			}
		}

		if (this.savedTracks) {
			editor.timeline.updateTracks(this.savedTracks);
		}
	}
}
