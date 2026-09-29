import { create } from "zustand";
import type { SavedSound, SoundEffect } from "@/sounds/types";
import { storageService } from "@/services/storage/service";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import { soundEffectWav } from "@/media/sound-effects";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia, buildLibraryAudioElement } from "@/timeline/element-utils";
import { mediaTimeFromSeconds } from "@/wasm";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import { BatchCommand } from "@/commands";
import { LOCAL_SOUND_EFFECTS } from "@/sounds/local-effects";

interface SoundsStore {
	localSoundEffects: SoundEffect[];
	savedSounds: SavedSound[];
	isSavedSoundsLoaded: boolean;
	isLoadingSavedSounds: boolean;
	savedSoundsError: string | null;

	addSoundToTimeline: ({ sound }: { sound: SoundEffect }) => Promise<boolean>;
	loadSavedSounds: () => Promise<void>;
	saveSoundEffect: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	removeSavedSound: ({ soundId }: { soundId: number }) => Promise<void>;
	isSoundSaved: ({ soundId }: { soundId: number }) => boolean;
	toggleSavedSound: ({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}) => Promise<void>;
	clearSavedSounds: () => Promise<void>;
}

export const useSoundsStore = create<SoundsStore>((set, get) => ({
	localSoundEffects: [...LOCAL_SOUND_EFFECTS],
	savedSounds: [],
	isSavedSoundsLoaded: false,
	isLoadingSavedSounds: false,
	savedSoundsError: null,

	loadSavedSounds: async () => {
		if (get().isSavedSoundsLoaded) return;

		try {
			set({ isLoadingSavedSounds: true, savedSoundsError: null });
			const savedSoundsData = await storageService.loadSavedSounds();
			set({
				savedSounds: savedSoundsData.sounds,
				isSavedSoundsLoaded: true,
				isLoadingSavedSounds: false,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to load saved sounds";
			set({
				savedSoundsError: errorMessage,
				isLoadingSavedSounds: false,
			});
			console.error("Failed to load saved sounds:", error);
		}
	},

	saveSoundEffect: async ({ soundEffect }) => {
		try {
			await storageService.saveSoundEffect({ soundEffect });

			const savedSoundsData = await storageService.loadSavedSounds();
			set({ savedSounds: savedSoundsData.sounds });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to save sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to save sound");
			console.error("Failed to save sound:", error);
		}
	},

	removeSavedSound: async ({ soundId }) => {
		try {
			await storageService.removeSavedSound({ soundId });

			set((state) => ({
				savedSounds: state.savedSounds.filter((sound) => sound.id !== soundId),
			}));
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to remove sound";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to remove sound");
			console.error("Failed to remove sound:", error);
		}
	},

	isSoundSaved: ({ soundId }) => {
		const { savedSounds } = get();
		return savedSounds.some((sound) => sound.id === soundId);
	},

	toggleSavedSound: async ({ soundEffect }) => {
		const { isSoundSaved, saveSoundEffect, removeSavedSound } = get();

		if (isSoundSaved({ soundId: soundEffect.id })) {
			await removeSavedSound({ soundId: soundEffect.id });
		} else {
			await saveSoundEffect({ soundEffect });
		}
	},

	clearSavedSounds: async () => {
		try {
			await storageService.clearSavedSounds();
			set({
				savedSounds: [],
				savedSoundsError: null,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to clear saved sounds";
			set({ savedSoundsError: errorMessage });
			toast.error("Failed to clear saved sounds");
			console.error("Failed to clear saved sounds:", error);
		}
	},

	addSoundToTimeline: async ({ sound }) => {
		const editor = EditorCore.getInstance();
		const activeProject = editor.project.getActive();
		if (!activeProject) {
			toast.error("No active project");
			return false;
		}
		const currentTime = editor.playback.getCurrentTime();

		try {
			if (sound.kind) {
				const { bytes, seconds } = soundEffectWav(sound.kind);
				const file = new File([bytes], `${sound.name}.wav`, {
					type: "audio/wav",
				});

				const [asset] = await processMediaAssets({ files: [file] });
				if (!asset) throw new Error("Could not process sound effect");

				const addMediaCmd = new AddMediaAssetCommand({
					projectId: activeProject.metadata.id,
					asset,
				});
				const assetId = addMediaCmd.getAssetId();
				const duration =
					asset.duration != null
						? mediaTimeFromSeconds({ seconds: asset.duration })
						: mediaTimeFromSeconds({ seconds });

				const element = buildElementFromMedia({
					mediaId: assetId,
					mediaType: "audio",
					name: asset.name,
					duration,
					startTime: currentTime,
				});

				const insertCmd = new InsertElementCommand({
					element,
					placement: { mode: "auto", trackType: "audio" },
				});

				editor.command.execute({
					command: new BatchCommand([addMediaCmd, insertCmd]),
				});
				return true;
			}

			const audioUrl = sound.previewUrl;
			if (!audioUrl) {
				toast.error("Sound file not available");
				return false;
			}

			const response = await fetch(audioUrl);
			if (!response.ok)
				throw new Error(`Failed to download audio: ${response.statusText}`);

			const arrayBuffer = await response.arrayBuffer();
			const audioContext = new AudioContext();
			const buffer = await audioContext.decodeAudioData(arrayBuffer);

			const element = buildLibraryAudioElement({
				sourceUrl: audioUrl,
				name: sound.name,
				duration: mediaTimeFromSeconds({ seconds: sound.duration }),
				startTime: currentTime,
				buffer,
			});

			editor.timeline.insertElement({
				placement: { mode: "auto", trackType: "audio" },
				element,
			});
			return true;
		} catch (error) {
			console.error("Failed to add sound to timeline:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to add sound to timeline",
				{ id: `sound-${sound.id}` },
			);
			return false;
		}
	},
}));
