import type { EditorCore } from "@/core";
import { whenEditorReady } from "@/services/editor-ready";
import { decodeAudioToFloat32 } from "@/media/audio";
import { mediaSupportsAudio } from "@/media/media-utils";
import type { MediaAsset } from "@/media/types";
import { host, files } from "@ispo/sdk";
import {
	transcribeWithHostSpeech,
	type HostSpeechTranscriptionSdk,
} from "@/services/transcription/cloud-transcription";
import { projectFolder } from "@/services/storage/project-folder";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	TranscriptionLanguage,
	TranscriptionProgress,
	TranscriptionSegment,
} from "@/transcription/types";

export interface TranscribeMediaInput {
	mediaName?: string;
	language?: string;
}

export interface TranscribeMediaData {
	text: string;
	language: string;
	segments: TranscriptionSegment[];
	segmentsTruncated?: boolean;
}

export interface TranscribeMediaResult {
	kind: "json";
	data: TranscribeMediaData;
}

type TranscribeMediaImplementation = (
	input: TranscribeMediaInput,
) => Promise<TranscribeMediaResult>;

const MAX_RESULT_SEGMENTS = 5_000;
const MAX_LISTED_MEDIA_NAMES = 20;

type TranscribeMediaProgressListener = (
	progress: TranscriptionProgress,
) => void;

const progressListeners = new Set<TranscribeMediaProgressListener>();

const liveSdk: HostSpeechTranscriptionSdk = { host, files };

/**
 * Observe transcription progress for runs going through
 * `transcribeMediaCommand.run`. Runs are effectively serial and listeners see
 * the active run's progress.
 */
export function subscribeTranscribeMediaProgress(
	listener: TranscribeMediaProgressListener,
): () => void {
	progressListeners.add(listener);
	return () => progressListeners.delete(listener);
}

function emitTranscribeMediaProgress(progress: TranscriptionProgress): void {
	progressListeners.forEach((listener) => {
		listener(progress);
	});
}

function listMediaNames({ candidates }: { candidates: MediaAsset[] }): string {
	const names = candidates
		.slice(0, MAX_LISTED_MEDIA_NAMES)
		.map((asset) => `"${asset.name}"`);
	const overflow = candidates.length - MAX_LISTED_MEDIA_NAMES;
	return overflow > 0
		? `${names.join(", ")} and ${overflow} more`
		: names.join(", ");
}

function resolveTranscribableAsset({
	assets,
	mediaName,
}: {
	assets: MediaAsset[];
	mediaName: string | undefined;
}): MediaAsset {
	const candidates = assets.filter((media) => mediaSupportsAudio({ media }));
	if (candidates.length === 0) {
		throw new Error(
			"No audio or video media is loaded in the open OpenCut project. Add the media to the project's media library first, then retry.",
		);
	}

	const wanted = mediaName?.trim() ?? "";
	if (wanted === "") {
		if (candidates.length === 1) {
			return candidates[0];
		}
		throw new Error(
			`Multiple audio/video media items are loaded: ${listMediaNames({ candidates })}. Pass mediaName to pick one.`,
		);
	}

	const exact = candidates.filter((asset) => asset.name === wanted);
	if (exact.length === 1) {
		return exact[0];
	}
	if (exact.length > 1) {
		throw new Error(
			`Multiple loaded media items are named "${wanted}". Rename the duplicates in OpenCut, then retry.`,
		);
	}

	const relaxed = candidates.filter(
		(asset) => asset.name.toLowerCase() === wanted.toLowerCase(),
	);
	if (relaxed.length === 1) {
		return relaxed[0];
	}

	throw new Error(
		`No loaded audio/video media item is named "${wanted}". Loaded: ${listMediaNames({ candidates })}.`,
	);
}

function resolveLanguage({
	language,
}: {
	language: string | undefined;
}): TranscriptionLanguage | undefined {
	const wanted = language?.trim().toLowerCase() ?? "";
	if (wanted === "" || wanted === "auto") {
		return undefined;
	}
	const matched = TRANSCRIPTION_LANGUAGES.find(
		(entry) => entry.code === wanted,
	);
	if (!matched) {
		const supported = TRANSCRIPTION_LANGUAGES.map(
			(entry) => entry.code,
		).join(", ");
		throw new Error(
			`Unsupported transcription language "${language}". Use "auto" or one of: ${supported}.`,
		);
	}
	return matched.code;
}

function normalizeTranscribeMediaInput({
	input,
}: {
	input: unknown;
}): TranscribeMediaInput {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return {};
	}
	const record = input as Record<string, unknown>;
	const normalized: TranscribeMediaInput = {};
	if (typeof record.mediaName === "string") {
		normalized.mediaName = record.mediaName;
	}
	if (typeof record.language === "string") {
		normalized.language = record.language;
	}
	return normalized;
}

/**
 * The one transcription use case, bound to the live editor. The Captions panel
 * and cross-project §25 callers both go through `transcribeMediaCommand.run`.
 */
function createTranscribeMediaImplementation({
	editor,
	sdk,
}: {
	editor: EditorCore;
	sdk: HostSpeechTranscriptionSdk;
}): TranscribeMediaImplementation {
	return async (input) => {
		const asset = resolveTranscribableAsset({
			assets: editor.media.getAssets(),
			mediaName: input.mediaName,
		});
		const language = resolveLanguage({ language: input.language });

		const { samples, sampleRate } = await decodeAudioToFloat32({
			audioBlob: asset.file,
			sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
		});

		emitTranscribeMediaProgress({
			status: "transcribing",
			progress: 0,
			message: "Transcribing audio...",
		});

		const activeProject = editor.project.getActive();
		const result = await transcribeWithHostSpeech({
			samples,
			sampleRate,
			language,
			sdk,
			...(activeProject
				? {
						folder: projectFolder({
							editId: activeProject.metadata.id,
							name: activeProject.metadata.name,
							section: "Transcripts",
						}),
					}
				: {}),
		});

		const segments = result.segments
			.slice(0, MAX_RESULT_SEGMENTS)
			.map(({ start, end, text }) => ({ start, end, text }));

		return {
			kind: "json",
			data: {
				text: result.text,
				language: result.language,
				segments,
				...(result.segments.length > segments.length
					? { segmentsTruncated: true }
					: {}),
			},
		};
	};
}

/**
 * Runtime entry for the `transcribe-media` command. The `commands.define`
 * metadata lives in `@/services/project-commands` (the build's command-catalog
 * analyzer requires define + expose in one module); this function is the
 * implementation it dispatches to.
 */
export async function runTranscribeMedia(
	input: unknown,
): Promise<TranscribeMediaResult> {
	const editor = await whenEditorReady();
	const run = createTranscribeMediaImplementation({ editor, sdk: liveSdk });
	return run(normalizeTranscribeMediaInput({ input }));
}

/**
 * Runtime entry for the `transcribe-media` project command. Uses the
 * command-scoped SDK (host + files) so the publish and transcription calls are
 * attributed to the invocation, while still resolving the media through the
 * mounted editor the command runs inside.
 */
export async function runTranscribeMediaCommand(
	input: unknown,
	sdk: HostSpeechTranscriptionSdk,
): Promise<TranscribeMediaResult> {
	const editor = await whenEditorReady();
	const run = createTranscribeMediaImplementation({ editor, sdk });
	return run(normalizeTranscribeMediaInput({ input }));
}
