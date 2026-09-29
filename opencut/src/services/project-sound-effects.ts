import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import type { EditRevision } from "@/project/production-types";
import { SdkProductionMediaLibrary, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import {
	soundEffectWav,
	soundEffectDigest,
	verifySoundEffectWav,
	defaultSoundEffectDuration,
	type SoundEffectKind,
} from "@/media/sound-effects";

export interface SoundEffectInput {
	editId: string;
	expectedRevision: EditRevision;
	effect: SoundEffectKind;
	startSeconds: number;
	seconds?: number;
	volumeDb?: number;
	seed?: number;
	name?: string;
}

export async function addSoundEffect(
	input: SoundEffectInput,
	sdk: ProductionDocumentSdk,
	library?: ProductionMediaLibrary,
) {
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") throw new Error("Saved edit required.");
	const revision = current.document.revision;
	if (
		Object.entries(revision).some(
			([key, value]) => input.expectedRevision[key as keyof EditRevision] !== value,
		)
	)
		throw new Error("Revision conflict; refresh the edit.");

	const project = structuredClone(current.document.project);
	const scene = project.scenes[0];
	const duration = Math.max(
		...[scene.tracks.main, ...scene.tracks.overlay].flatMap((track) =>
			track.elements.map(
				(element) =>
					mediaTimeToSeconds({ time: element.startTime }) +
					mediaTimeToSeconds({ time: element.duration }),
			),
		),
	);
	const seconds = input.seconds ?? defaultSoundEffectDuration(input.effect);
	const { bytes } = soundEffectWav(input.effect, { seconds, seed: input.seed });
	if (input.startSeconds + seconds > duration)
		throw new Error("Sound effect must fit the existing timeline.");
	const digest = await soundEffectDigest(bytes);
	verifySoundEffectWav(bytes, seconds);

	const mediaId = `sfx-${input.effect}-${digest.slice(0, 16)}`;
	const name = input.name ?? `${input.effect} sound effect`;
	const imported = await (library ?? new SdkProductionMediaLibrary(sdk)).import({
		editId: input.editId,
		mediaId,
		mediaRevision: digest,
		role: "narration",
		name: `${name}.wav`,
		mimeType: "audio/wav",
		digest,
		duration: seconds,
		file: new File([bytes], `${name}.wav`, { type: "audio/wav" }),
	});

	const time = (value: number) => mediaTimeFromSeconds({ seconds: value });
	const volumeDb = input.volumeDb ?? -9;
	const elementId = `${input.effect}-${digest.slice(0, 12)}-${Math.round(input.startSeconds * 1000)}`;
	let track = scene.tracks.audio.find((candidate) => candidate.id === "sound-effects");
	if (!track) {
		track = {
			id: "sound-effects",
			name: "Sound effects",
			type: "audio",
			muted: false,
			elements: [],
		};
		scene.tracks.audio.push(track);
	}
	track.elements.push({
		id: elementId,
		name,
		type: "audio",
		sourceType: "upload",
		mediaId,
		startTime: time(input.startSeconds),
		duration: time(seconds),
		sourceDuration: time(seconds),
		trimStart: time(0),
		trimEnd: time(0),
		params: { volume: volumeDb, muted: false },
	});

	await documents.save({ editId: input.editId, project, expectedRevision: input.expectedRevision });
	const saved = await documents.readCurrent(input.editId);
	if (saved?.kind !== "document") throw new Error("Cannot read saved edit.");
	return {
		kind: "json" as const,
		data: {
			revision: saved.document.revision,
			mediaId,
			elementId,
			effect: input.effect,
			artifact: imported.filesRef,
			sha256: digest,
			byteLength: bytes.length,
			startSeconds: input.startSeconds,
			durationSeconds: seconds,
			volumeDb,
		},
	};
}
