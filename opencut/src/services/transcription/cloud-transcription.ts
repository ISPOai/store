import type { FilesApi, HostApi } from "@ispo/sdk";
import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionSegment,
} from "@/transcription/types";

const TRANSCRIPTION_FOLDER = "OpenCut/transcription";

const TRANSCRIBE_TIMEOUT_MS = 120_000;

export interface HostSpeechTranscriptionSdk {
	host: Pick<HostApi, "speech">;
	files: Pick<FilesApi, "publish">;
}

export interface TranscribeWithHostSpeechInput {
	samples: Float32Array;
	sampleRate: number;
	language?: TranscriptionLanguage;
	sdk: HostSpeechTranscriptionSdk;
	/** Files folder for the intermediate WAV; defaults to the app-wide bin when
	 * the caller has no edit in hand. */
	folder?: string;
}

/**
 * PCM16 mono WAV encoder. The host speech producer accepts only `audio/wav`
 * PCM bytes, so the decoded Float32 audio is reserialized before publish.
 */
export function encodePcm16Wav({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): Uint8Array<ArrayBuffer> {
	const dataSize = samples.length * 2;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);
	const writeString = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i++) {
			view.setUint8(offset + i, value.charCodeAt(i));
		}
	};
	writeString(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeString(36, "data");
	view.setUint32(40, dataSize, true);
	const pcm = new Int16Array(buffer, 44);
	for (let i = 0; i < samples.length; i++) {
		const value = Math.max(-1, Math.min(1, samples[i]));
		pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
	}
	return new Uint8Array(buffer);
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function idempotencyKey({
	digest,
	language,
}: {
	digest: string;
	language: string | undefined;
}): string {
	return `transcribe-${digest}-${language ?? "auto"}`;
}

function mapSegments(
	words: Array<{ text: string; startMs: number; endMs: number }>,
): TranscriptionSegment[] {
	return words.map((word) => ({
		text: word.text,
		start: word.startMs / 1000,
		end: word.endMs / 1000,
	}));
}

/**
 * Transcribe a decoded mono audio buffer through the host's managed Cloud
 * speech producer (`host.speech.transcribe`). The audio is published to this
 * project's Files as a PCM WAV, transcribed, and the returned word timeline is
 * mapped back to OpenCut segments. Deterministic per-content idempotency lets a
 * caller re-run the same clip to collect a job that outlived the RPC timeout.
 */
export async function transcribeWithHostSpeech({
	samples,
	sampleRate,
	language,
	sdk,
	folder,
}: TranscribeWithHostSpeechInput): Promise<TranscriptionResult> {
	const wavBytes = encodePcm16Wav({ samples, sampleRate });
	const digest = await sha256Hex(wavBytes);
	const languageCode = language && language !== "auto" ? language : undefined;
	const key = idempotencyKey({ digest, language: languageCode });

	const published = await sdk.files.publish({
		content: wavBytes,
		name: `transcription-${digest.slice(0, 16)}.wav`,
		mimeType: "audio/wav",
		folder: folder ?? TRANSCRIPTION_FOLDER,
	});

	const result = await sdk.host.speech.transcribe({
		audioPublicId: published.publicId,
		...(languageCode ? { languageCode } : {}),
		idempotencyKey: key,
		timeoutMs: TRANSCRIBE_TIMEOUT_MS,
	});

	return {
		text: result.text,
		language: result.languageCode,
		segments: mapSegments(result.words),
	};
}
