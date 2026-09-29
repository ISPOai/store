import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import type { EditRevision } from "@/project/production-types";
import { SdkProductionMediaLibrary, type ProductionMediaLibrary } from "@/services/storage/production-media-adapter";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

/** A broadband pressure crack followed by filtered, non-tonal rubble and rumble. */
export function explosionWav(mellow = false) {
  const rate = 48000, seconds = 1.8, count = Math.round(rate * seconds);
  const bytes = new Uint8Array(44 + count * 2), view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, count * 2, true);
  const samples = new Float32Array(count);
  let seed = 317, bass = 0, body = 0, dc = 0, peak = 0;
  for (let index = 0; index < count; index++) {
    const t = index / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    bass += 0.021 * (noise - bass);
    body += (mellow ? 0.075 : 0.22) * (noise - body);
    dc += 0.004 * (bass - dc);
    const attack = Math.min(1, t / (mellow ? 0.025 : 0.001)), fade = Math.min(1, (seconds - t) / 0.22);
    // No oscillator, pitch sweep, periodic modulation, or clipping distortion.
    const crack = (noise - body) * (mellow ? 0.06 : 0.65) * Math.exp(-t * 65);
    const blast = body * 1.9 * Math.exp(-t * 9);
    const rumble = (bass - dc) * 4.5 * (1 - Math.exp(-t * 100)) * Math.exp(-t * 3.4);
    samples[index] = attack * fade * (crack + blast + rumble);
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  for (let index = 0; index < count; index++) view.setInt16(44 + index * 2, Math.round(samples[index] / Math.max(peak, 0.001) * (mellow ? 0.46 : 0.92) * 32767), true);
  return { bytes, seconds };
}

export async function addExplosion(input: { editId: string; expectedRevision: EditRevision; startSeconds: number; replaceExisting?: boolean; mellow?: boolean }, sdk: ProductionDocumentSdk, library?: ProductionMediaLibrary) {
  const documents = new ProductionDocumentService(sdk);
  const current = await documents.readCurrent(input.editId);
  if (current?.kind !== "document") throw new Error("Saved edit required.");
  const revision = current.document.revision;
  if (Object.entries(revision).some(([key, value]) => input.expectedRevision[key as keyof EditRevision] !== value)) throw new Error("Revision conflict; refresh the edit.");
  const project = structuredClone(current.document.project);
  const scene = project.scenes[0];
  const duration = Math.max(...[scene.tracks.main, ...scene.tracks.overlay].flatMap(track => track.elements.map(element => mediaTimeToSeconds({ time: element.startTime }) + mediaTimeToSeconds({ time: element.duration }))));
  const { bytes, seconds } = explosionWav(input.mellow);
  if (input.startSeconds + seconds > duration) throw new Error("Explosion must fit the existing timeline.");
  const existing = scene.tracks.audio.find(track => track.id === "explosion-sfx")?.elements.find(element => element.id === "explosion-impact");
  if (existing && !input.replaceExisting) throw new Error("Explosion already exists; set replaceExisting to replace it.");
  if (input.replaceExisting && !existing) throw new Error("Existing explosion required for replacement.");
  if (existing && existing.sourceType !== "upload") throw new Error("Uploaded explosion required for replacement.");
  if (existing && mediaTimeToSeconds({ time: existing.startTime }) !== input.startSeconds) throw new Error("Replacement must preserve explosion timing.");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  const mediaId = `explosion-${digest.slice(0, 24)}`;
  const name = input.mellow ? "Mellow explosion" : "Cinematic explosion";
  const imported = await (library ?? new SdkProductionMediaLibrary(sdk)).import({ editId: input.editId, mediaId, mediaRevision: digest, role: "narration", name: `${name}.wav`, mimeType: "audio/wav", digest, duration: seconds, file: new File([bytes], `${name}.wav`, { type: "audio/wav" }) });
  const time = (seconds: number) => mediaTimeFromSeconds({ seconds });
  if (existing && existing.sourceType === "upload") {
    existing.mediaId = mediaId;
    existing.name = name;
    existing.duration = time(seconds);
    existing.sourceDuration = time(seconds);
    existing.trimStart = time(0);
    existing.trimEnd = time(0);
  } else scene.tracks.audio.push({ id: "explosion-sfx", name: "Explosion effect", type: "audio", muted: false, elements: [{ id: "explosion-impact", name: "Magic explosion", type: "audio", sourceType: "upload", mediaId, startTime: time(input.startSeconds), duration: time(seconds), sourceDuration: time(seconds), trimStart: time(0), trimEnd: time(0), params: { volume: -9, muted: false } }] });
  await documents.save({ editId: input.editId, project, expectedRevision: input.expectedRevision });
  const saved = await documents.readCurrent(input.editId);
  if (saved?.kind !== "document") throw new Error("Cannot read saved edit.");
  return { kind: "json" as const, data: { revision: saved.document.revision, mediaId, artifact: imported.filesRef, sha256: digest, byteLength: bytes.length, startSeconds: input.startSeconds, durationSeconds: seconds, volumeDb: existing?.params.volume ?? -9 } };
}
