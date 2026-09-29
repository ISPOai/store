import type { SoundEffectKind } from "@/media/sound-effects";

export interface SoundEffect {
	id: number;
	name: string;
	description: string;
	url: string;
	previewUrl?: string;
	downloadUrl?: string;
	duration: number;
	filesize: number;
	type: string;
	channels: number;
	bitrate: number;
	bitdepth: number;
	samplerate: number;
	username: string;
	tags: string[];
	license: string;
	created: string;
	downloads: number;
	rating: number;
	ratingCount: number;
	// Set for locally synthesized effects; when present, playback and
	// timeline placement synthesize from this kind instead of a remote URL.
	kind?: SoundEffectKind;
}

export interface SavedSound {
	id: number; // freesound id, or a stable id for a local synthesized effect
	name: string;
	username: string;
	previewUrl?: string;
	downloadUrl?: string;
	duration: number;
	tags: string[];
	license: string;
	savedAt: string; // iso date string
	// Set for locally synthesized effects saved by the user.
	kind?: SoundEffectKind;
}

export interface SavedSoundsData {
	sounds: SavedSound[];
	lastModified: string;
}
