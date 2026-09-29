import type { CommandResourceDelivery } from "@ispo/sdk";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import type { EditRevision } from "@/project/production-types";
import { SdkProductionMediaLibrary, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

export interface ImportAudioClip {
  item: number;
  startSeconds: number;
  name?: string;
  volumeDb?: number;
}

export interface ImportAudioInput {
  editId: string;
  expectedRevision: EditRevision;
  trackId?: string;
  trackName?: string;
  clips: ImportAudioClip[];
}

/** RIFF/WAVE PCM header read: the host already validated the container. */
function wavDuration(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw new Error("The delivered audio is not a RIFF WAVE file.");
  }
  let offset = 12, byteRate = 0, dataLength = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = view.getUint32(offset, false), size = view.getUint32(offset + 4, true);
    if (id === 0x666d7420) byteRate = view.getUint32(offset + 16, true);
    if (id === 0x64617461) { dataLength = Math.min(size, bytes.byteLength - offset - 8); break; }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataLength) throw new Error("The delivered WAV has no readable fmt/data chunks.");
  return dataLength / byteRate;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Import host-delivered PCM WAV resources (the `audio` slot) into the edit's
 * media library and place each requested clip on one audio track, preserving
 * every other element. Mirrors the explosion command's placement path.
 */
export async function importAudio(
  input: ImportAudioInput,
  sdk: ProductionDocumentSdk,
  resources: readonly CommandResourceDelivery[],
  library?: ProductionMediaLibrary,
) {
  const slot = resources.find((delivery) => delivery.slot === "audio");
  if (!slot || slot.items.length === 0) throw new Error("The audio resource slot delivered no items.");
  if (input.clips.length === 0) throw new Error("Name at least one clip to place.");
  const documents = new ProductionDocumentService(sdk);
  const current = await documents.readCurrent(input.editId);
  if (current?.kind !== "document") throw new Error("Saved edit required.");
  const revision = current.document.revision;
  if (Object.entries(revision).some(([key, value]) => input.expectedRevision[key as keyof EditRevision] !== value)) {
    throw new Error("Revision conflict; refresh the edit.");
  }
  const project = structuredClone(current.document.project);
  const scene = project.scenes[0];
  const time = (seconds: number) => mediaTimeFromSeconds({ seconds });
  const media = library ?? new SdkProductionMediaLibrary(sdk);
  const trackId = input.trackId?.trim() || "sound-effects";
  let track = scene.tracks.audio.find((candidate) => candidate.id === trackId);
  if (!track) {
    track = { id: trackId, name: input.trackName?.trim() || "Sound effects", type: "audio", muted: false, elements: [] };
    scene.tracks.audio.push(track);
  }
  const placed = [];
  for (const clip of input.clips) {
    const item = slot.items[clip.item];
    if (!item) throw new Error(`Audio item ${clip.item} was not delivered.`);
    if (item.mediaType !== "audio/wav") throw new Error(`Audio item ${clip.item} is ${item.mediaType}, not PCM WAV.`);
    const seconds = wavDuration(item.bytes);
    const digest = await sha256Hex(item.bytes);
    const mediaId = `audio-${digest.slice(0, 24)}`;
    const name = clip.name?.trim() || item.name.replace(/\.wav$/i, "") || "Imported audio";
    const file = new File([item.bytes.slice().buffer], `${name}.wav`, { type: "audio/wav" });
    const imported = await media.import({
      editId: input.editId, mediaId, mediaRevision: digest, role: "narration", name: `${name}.wav`,
      mimeType: "audio/wav", digest, file, duration: seconds,
    });
    const elementId = `${trackId}-${mediaId}-${Math.round(clip.startSeconds * 1000)}`;
    const existing = track.elements.findIndex((element) => element.id === elementId);
    const element = {
      id: elementId, name, type: "audio" as const, sourceType: "upload" as const, mediaId,
      startTime: time(clip.startSeconds), duration: time(seconds), sourceDuration: time(seconds),
      trimStart: time(0), trimEnd: time(0), params: { volume: clip.volumeDb ?? -6, muted: false },
    };
    if (existing >= 0) track.elements[existing] = element; else track.elements.push(element);
    placed.push({ id: elementId, mediaId, name, startSeconds: clip.startSeconds, durationSeconds: seconds, artifact: imported.filesRef ?? null });
  }
  await documents.save({ editId: input.editId, project, expectedRevision: input.expectedRevision });
  const saved = await documents.readCurrent(input.editId);
  if (saved?.kind !== "document") throw new Error("Cannot read saved edit.");
  const savedTrack = saved.document.project.scenes[0].tracks.audio.find((candidate) => candidate.id === trackId);
  const landed = placed.filter((clip) => savedTrack?.elements.some((element) => element.id === clip.id));
  if (landed.length !== placed.length) throw new Error("Placed clips did not persist on the saved timeline.");
  return {
    kind: "json" as const,
    data: {
      revision: saved.document.revision, trackId, clips: placed,
      timeline: savedTrack?.elements.map((element) => ({ id: element.id, name: element.name, startSeconds: mediaTimeToSeconds({ time: element.startTime }), durationSeconds: mediaTimeToSeconds({ time: element.duration }) })) ?? [],
    },
  };
}
