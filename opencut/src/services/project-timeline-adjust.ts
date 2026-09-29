import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import type { EditRevision } from "@/project/production-types";
import { mediaTime, mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import type { TimelineElement } from "@/timeline/types";
import { EditorCore } from "@/core";

export interface TimelineAdjustment {
  editId: string;
  expectedRevision?: EditRevision;
  previewSeconds?: number;
  inspectSourceFrame?: boolean;
  shots?: Array<{ shotId: string; scale?: number; visualDurationSeconds?: number; captionY?: number; captionBackground?: boolean; narrationStartSeconds?: number }>;
}

/** Uses the same revisioned document and element params as the editor inspector. */
export async function adjustProductionTimeline(input: TimelineAdjustment, sdk: ProductionDocumentSdk) {
  const documents = new ProductionDocumentService(sdk);
  const current = await documents.readCurrent(input.editId);
  if (current?.kind !== "document") throw new Error("Saved edit required.");
  const project = structuredClone(current.document.project);
  const elements = project.scenes.flatMap(scene => [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio].flatMap<TimelineElement>(track => track.elements));
  for (const change of input.shots ?? []) {
    if (!input.expectedRevision) throw new Error("Expected revision required for adjustments.");
    const selected = elements.filter(element => element.production?.shotId === change.shotId);
    const visual = selected.find(element => element.type === "video");
    const narration = selected.find(element => element.type === "audio");
    if (!visual || visual.type !== "video" || !narration) throw new Error("Shot requires existing video and narration.");
    if (change.scale !== undefined) {
      visual.params["transform.scaleX"] = change.scale;
      visual.params["transform.scaleY"] = change.scale;
      visual.params["transform.positionX"] = 0;
      visual.params["transform.positionY"] = 0;
    }
    if (change.visualDurationSeconds !== undefined) {
      const duration = mediaTimeFromSeconds({ seconds: change.visualDurationSeconds });
      if (!visual.sourceDuration || visual.trimStart + duration > visual.sourceDuration) throw new Error("Visual duration exceeds its saved source.");
      visual.duration = duration;
      visual.trimEnd = mediaTime({ ticks: visual.sourceDuration - visual.trimStart - duration });
    }
    visual.isSourceAudioEnabled = false;
    if (change.narrationStartSeconds !== undefined) {
      const start = mediaTimeFromSeconds({ seconds: change.narrationStartSeconds });
      if (start < visual.startTime || start + narration.duration > visual.startTime + visual.duration) throw new Error("Narration must fit inside its visual shot.");
      const delta = start - narration.startTime;
      for (const element of selected.filter(element => element.production?.role === "caption" || element.type === "audio")) {
        element.startTime = mediaTime({ ticks: element.startTime + delta });
      }
    }
    if (change.captionY !== undefined) for (const element of selected.filter(element => element.production?.role === "caption")) {
      element.params["transform.positionY"] = change.captionY;
    }
    if (change.captionBackground !== undefined) for (const element of selected.filter(element => element.production?.role === "caption")) {
      element.params["background.enabled"] = change.captionBackground;
    }
  }
  if (input.shots?.length) await documents.save({ editId: input.editId, project, expectedRevision: input.expectedRevision! });
  const saved = await documents.readCurrent(input.editId);
  if (saved?.kind !== "document") throw new Error("Saved edit could not be read back.");
  let sourceFrame: string | undefined;
  if (input.previewSeconds !== undefined) {
    const editor = EditorCore.getInstance();
    if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) throw new Error("Open the edit before seeking its preview.");
    editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: input.previewSeconds }) });
    if (input.inspectSourceFrame) {
      const clip = elements.find(element => element.type === "video" && input.previewSeconds! >= mediaTimeToSeconds({ time: element.startTime }) && input.previewSeconds! < mediaTimeToSeconds({ time: mediaTime({ ticks: element.startTime + element.duration }) }));
      if (!clip || clip.type !== "video") throw new Error("No video at preview time.");
      const asset = editor.media.getAssets().find(asset => asset.id === clip.mediaId);
      if (!asset) throw new Error("Video asset unavailable.");
      const url = URL.createObjectURL(asset.file);
      const video = document.createElement("video");
      try {
        video.muted = true;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Cannot decode video.")); video.src = url;
        });
        await new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve(); video.onerror = () => reject(new Error("Cannot seek video."));
          video.currentTime = Math.max(0.001, input.previewSeconds! - mediaTimeToSeconds({ time: clip.startTime }) + mediaTimeToSeconds({ time: clip.trimStart }));
        });
        const canvas = document.createElement("canvas"); canvas.width = 360; canvas.height = Math.round(360 * video.videoHeight / video.videoWidth);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        sourceFrame = canvas.toDataURL("image/jpeg", 0.8);
      } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
    }
  }
  return { kind: "json" as const, data: {
    revision: saved.document.revision,
    ...(sourceFrame ? { sourceFrame } : {}),
    elements: saved.document.project.scenes.flatMap(scene => [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio].flatMap<TimelineElement>(track => track.elements)).map(element => ({
      id: element.id, type: element.type, shotId: element.production?.shotId ?? "", role: element.production?.role ?? "", startSeconds: mediaTimeToSeconds({ time: element.startTime }), durationSeconds: mediaTimeToSeconds({ time: element.duration }), params: element.params,
      ...(element.type === "video" ? { sourceAudioEnabled: element.isSourceAudioEnabled } : {}),
    })),
  } };
}
