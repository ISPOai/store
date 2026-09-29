import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import { z } from "zod";
import { ProjectRpcError } from "@ispo/sdk";
import type { MediaAsset } from "@/media/types";
import { EditorCore } from "@/core";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { EditRevisionConflictError, type EditRevision } from "@/project/production-types";
import { buildElementFromMedia, buildTextElement } from "@/timeline/element-utils";
import type { TimelineElement, TimelineTrack } from "@/timeline/types";
import { canTrackHaveAudio } from "@/timeline/track-capabilities";
import { mediaTimeFromSeconds, mediaTimeToSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { generateUUID } from "@/utils/id";
import { transitionsRegistry } from "@/transitions";
import { DEFAULT_TRANSITION_DURATION_SECONDS } from "@/transitions";
import type { Transition } from "@/transitions";
import type { ScalarAnimationKey } from "@/animation/types";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import {
	REVERB_DECAY_MAX_SECONDS,
	REVERB_DECAY_MIN_SECONDS,
	REVERB_WET_MAX,
	REVERB_WET_MIN,
} from "@/media/reverb";

interface VolumeKeyframePlacement {
  timeSeconds: number;
  volumeDb: number;
  segmentToNext?: "linear" | "step" | "bezier";
}

interface ClipPlacement {
  id: string;
  assetId: string;
  trackId: string;
  startSeconds: number;
  durationSeconds: number;
  sourceStartSeconds?: number;
  volumeDb?: number;
  sourceAudioEnabled?: boolean;
  volumeKeyframes?: VolumeKeyframePlacement[];
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  reverbWet?: number;
  reverbDecaySeconds?: number;
}

interface CaptionPlacement {
  id: string;
  trackId: string;
  text: string;
  startSeconds: number;
  durationSeconds: number;
  fontSizePx?: number;
  positionY?: number;
}

interface TransitionPlacement {
  elementId: string;
  edge: "in" | "out";
  type: string;
  durationSeconds?: number;
}

interface TrackUpdate {
  id: string;
  muted?: boolean;
}

interface TextStylePlacement {
  elementId: string;
  stroke?: { color?: string; width?: number };
  shadow?: { color?: string; x?: number; y?: number; blur?: number };
  glow?: { color?: string; radius?: number };
}

export interface EditTimelineInput {
  editId: string;
  expectedRevision?: EditRevision;
  clips?: ClipPlacement[];
  captions?: CaptionPlacement[];
  transitions?: TransitionPlacement[];
  tracks?: TrackUpdate[];
  removeElements?: string[];
  textStyles?: TextStylePlacement[];
}

function invalid(message: string): never {
  throw new ProjectRpcError({ code: "input-invalid", message });
}

function putElement(track: TimelineTrack, element: TimelineElement) {
  const index = track.elements.findIndex(candidate => candidate.id === element.id);
  // Keep the track/element relation checked by TypeScript at every write.
  if (track.type === "video" && (element.type === "video" || element.type === "image")) {
    if (index < 0) track.elements.push(element); else track.elements[index] = element;
  } else if (track.type === "audio" && element.type === "audio") {
    if (index < 0) track.elements.push(element); else track.elements[index] = element;
  } else if (track.type === "text" && element.type === "text") {
    if (index < 0) track.elements.push(element); else track.elements[index] = element;
  } else invalid("The selected track does not support this element type.");
  track.elements.sort((left, right) => left.startTime - right.startTime);
}

// Volume envelopes, fades, and the reverb send are the audio shapes the engine
// already renders end to end (export mixdown + playback graph) but that the
// command surface previously could not reach. Fades are stored as non-destructive
// element params (fadeInSeconds/fadeOutSeconds) and compose multiplicatively with
// the volume keyframes in resolveEffectiveAudioGain.
function buildVolumeKeys(clip: ClipPlacement): ScalarAnimationKey[] | undefined {
  const explicit = clip.volumeKeyframes;
  if (explicit === undefined) return undefined;
  const key = (timeSeconds: number, volumeDb: number, index: number, segmentToNext: ScalarAnimationKey["segmentToNext"]): ScalarAnimationKey => ({
    id: `${clip.id}-vol-${index}`,
    time: mediaTimeFromSeconds({ seconds: timeSeconds }),
    value: volumeDb,
    segmentToNext,
    tangentMode: "flat",
  });
  let previousTime = -1;
  return explicit.map((point, index) => {
    if (!Number.isFinite(point.timeSeconds) || point.timeSeconds < 0 || point.timeSeconds > clip.durationSeconds + 0.000001) invalid("Volume keyframe times must fall inside the clip duration.");
    if (point.timeSeconds <= previousTime) invalid("Volume keyframe times must strictly ascend.");
    previousTime = point.timeSeconds;
    if (!Number.isFinite(point.volumeDb) || point.volumeDb < VOLUME_DB_MIN || point.volumeDb > VOLUME_DB_MAX) invalid(`Volume keyframe levels must fall between ${VOLUME_DB_MIN} and ${VOLUME_DB_MAX} dB.`);
    return key(point.timeSeconds, point.volumeDb, index, point.segmentToNext ?? "linear");
  });
}

function applyFadeParams(clip: ClipPlacement, element: TimelineElement) {
  if (clip.fadeInSeconds !== undefined) {
    if (!Number.isFinite(clip.fadeInSeconds) || clip.fadeInSeconds < 0) invalid("Fade in must be a finite nonnegative length in seconds.");
    element.params.fadeInSeconds = clip.fadeInSeconds;
  }
  if (clip.fadeOutSeconds !== undefined) {
    if (!Number.isFinite(clip.fadeOutSeconds) || clip.fadeOutSeconds < 0) invalid("Fade out must be a finite nonnegative length in seconds.");
    element.params.fadeOutSeconds = clip.fadeOutSeconds;
  }
}

function applyClipAudioShaping(clip: ClipPlacement, element: TimelineElement) {
  const shapes = clip.volumeKeyframes !== undefined || clip.fadeInSeconds !== undefined || clip.fadeOutSeconds !== undefined || clip.reverbWet !== undefined || clip.reverbDecaySeconds !== undefined;
  if (!shapes) return;
  if (element.type !== "audio" && element.type !== "video") invalid("Volume envelopes, fades, and reverb apply only to audio or video clips.");
  if (clip.reverbWet !== undefined) {
    if (!Number.isFinite(clip.reverbWet) || clip.reverbWet < REVERB_WET_MIN || clip.reverbWet > REVERB_WET_MAX) invalid(`Reverb wet must fall between ${REVERB_WET_MIN} and ${REVERB_WET_MAX}.`);
    element.params["reverb.wet"] = clip.reverbWet;
  }
  if (clip.reverbDecaySeconds !== undefined) {
    if (!Number.isFinite(clip.reverbDecaySeconds) || clip.reverbDecaySeconds < REVERB_DECAY_MIN_SECONDS || clip.reverbDecaySeconds > REVERB_DECAY_MAX_SECONDS) invalid(`Reverb decay must fall between ${REVERB_DECAY_MIN_SECONDS} and ${REVERB_DECAY_MAX_SECONDS} seconds.`);
    element.params["reverb.decay"] = clip.reverbDecaySeconds;
  }
  applyFadeParams(clip, element);
  const keys = buildVolumeKeys(clip);
  if (keys === undefined) return;
  const animations = { ...(element.animations ?? {}) };
  // An empty keyframe list is how a caller clears an envelope back to the flat
  // params.volume level.
  if (keys.length === 0) delete animations.volume; else animations.volume = { keys };
  element.animations = animations;
}

interface AssetSummary { id: string; name: string; type: MediaAsset["type"]; durationSeconds?: number }
function assetSummary(asset: MediaAsset): AssetSummary {
  const summary: AssetSummary = { id: asset.id, name: asset.name, type: asset.type };
  if (asset.duration !== undefined) summary.durationSeconds = asset.duration;
  return summary;
}
interface ElementSummary { id: string; trackId: string; type: TimelineElement["type"]; startSeconds: number; durationSeconds: number; sourceStartSeconds: number; assetId?: string; text?: string; volumeDb?: number; volumeKeyframeCount?: number; reverbWet?: number; reverbDecaySeconds?: number; fadeInSeconds?: number; fadeOutSeconds?: number }
function elementSummary(element: TimelineElement, trackId: string): ElementSummary {
  const summary: ElementSummary = { id: element.id, trackId, type: element.type, startSeconds: mediaTimeToSeconds({ time: element.startTime }), durationSeconds: mediaTimeToSeconds({ time: element.duration }), sourceStartSeconds: mediaTimeToSeconds({ time: element.trimStart }) };
  if ("mediaId" in element) summary.assetId = element.mediaId;
  // Echo the audio state back so a caller can verify a write instead of trusting it.
  if (element.type === "audio" || element.type === "video") {
    if (typeof element.params.volume === "number") summary.volumeDb = element.params.volume;
    const volumeChannel = element.animations?.volume;
    if (volumeChannel && "keys" in volumeChannel && Array.isArray(volumeChannel.keys)) summary.volumeKeyframeCount = volumeChannel.keys.length;
    if (typeof element.params["reverb.wet"] === "number") summary.reverbWet = element.params["reverb.wet"];
    if (typeof element.params["reverb.decay"] === "number") summary.reverbDecaySeconds = element.params["reverb.decay"];
    if (typeof element.params.fadeInSeconds === "number") summary.fadeInSeconds = element.params.fadeInSeconds;
    if (typeof element.params.fadeOutSeconds === "number") summary.fadeOutSeconds = element.params.fadeOutSeconds;
  }
  if (element.type === "text") {
    summary.text = z.string().parse(element.params.content);
  }
  return summary;
}

async function applyTimeline(input: EditTimelineInput, sdk: ProductionDocumentSdk) {
  const editor = EditorCore.getInstance();
  const documents = new ProductionDocumentService(sdk);
  const current = await documents.readCurrent(input.editId);
  if (current?.kind !== "document") invalid("A saved edit is required.");
  if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
    await editor.save.flush();
    navigateToEditorProject(input.editId);
    await whenEditorReady(input.editId);
  }
  const project = structuredClone(current.document.project);
  const scene = project.scenes.find(candidate => candidate.id === project.currentSceneId);
  if (!scene) invalid("The edit has no active scene.");
  const clips = input.clips ?? [];
  const captions = input.captions ?? [];
  const transitions = input.transitions ?? [];
  const trackUpdates = input.tracks ?? [];
  const removals = input.removeElements ?? [];
  const textStyles = input.textStyles ?? [];
  const changes = [...clips, ...captions];
  let revision = current.document.revision;
  if (changes.length || transitions.length || trackUpdates.length || removals.length || textStyles.length) {
    const expected = input.expectedRevision;
    if (!expected) invalid("Read the timeline and pass its exact revision before editing.");
    if (expected.editId !== revision.editId || expected.storageCasRevision !== revision.storageCasRevision || expected.intentRevision !== revision.intentRevision || expected.digest !== revision.digest) {
      throw new EditRevisionConflictError({ editId: input.editId, expected, actual: revision });
    }
    if (new Set(changes.map(change => change.id)).size !== changes.length) invalid("Each element ID must appear only once in a timeline update.");
    const tracks: TimelineTrack[] = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
    // Removals run first so a caller can swap an element's media by removing
    // the old ID and placing a new one in the same update.
    for (const id of removals) {
      const owner = tracks.find(track => track.elements.some(element => element.id === id));
      if (!owner) invalid("Unknown element ID in removeElements.");
      if (changes.some(change => change.id === id)) invalid("An element cannot be removed and placed in the same update.");
      owner.elements = owner.elements.filter(element => element.id !== id) as typeof owner.elements;
    }
    for (const change of changes) {
      if (!Number.isFinite(change.startSeconds) || change.startSeconds < 0 || !Number.isFinite(change.durationSeconds) || change.durationSeconds <= 0) invalid("Clip and caption times must be finite and durations must be positive.");
      const owner = tracks.find(track => track.elements.some(element => element.id === change.id));
      if (owner && owner.id !== change.trackId) invalid("An existing element must keep its track ID.");
    }
    for (const clip of clips) {
      const asset = editor.media.getAssets().find(candidate => candidate.id === clip.assetId);
      if (!asset) invalid("Import the selected media into this edit's Assets panel first.");
      const sourceStart = clip.sourceStartSeconds ?? 0;
      if (!Number.isFinite(sourceStart) || sourceStart < 0) invalid("Source start must be a finite nonnegative time.");
      if (asset.type !== "image" && (asset.duration === undefined || sourceStart + clip.durationSeconds > asset.duration + 0.000001)) invalid("The selected source range exceeds the imported media duration.");
      let track = tracks.find(candidate => candidate.id === clip.trackId);
      if (!track) {
        if (asset.type === "audio") {
          track = { id: clip.trackId, name: asset.name, type: "audio", muted: false, elements: [] };
          scene.tracks.audio.push(track);
        } else {
          track = { id: clip.trackId, name: "Video", type: "video", muted: false, hidden: false, elements: [] };
          scene.tracks.overlay.push(track);
        }
        tracks.push(track);
      }
      const previous = track.elements.find(element => element.id === clip.id);
      if (previous && (!("mediaId" in previous) || previous.mediaId !== clip.assetId)) invalid("An existing clip ID belongs to different media; use a new element ID.");
      const element: TimelineElement = {
        ...buildElementFromMedia({ mediaId: asset.id, mediaType: asset.type, name: asset.name, duration: mediaTimeFromSeconds({ seconds: clip.durationSeconds }), startTime: mediaTimeFromSeconds({ seconds: clip.startSeconds }) }),
        id: clip.id,
      };
      if (previous) element.params = { ...previous.params };
      element.trimStart = mediaTimeFromSeconds({ seconds: sourceStart });
      if (asset.duration !== undefined) {
        element.sourceDuration = mediaTimeFromSeconds({ seconds: asset.duration });
        element.trimEnd = mediaTimeFromSeconds({ seconds: Math.max(0, asset.duration - sourceStart - clip.durationSeconds) });
      }
      if (element.type === "video") element.isSourceAudioEnabled = clip.sourceAudioEnabled ?? false;
      // buildElementFromMedia returns a fresh element, so anything the previous
      // element carried outside params (volume envelopes, speed curves) has to be
      // carried across or repositioning a clip would silently drop it.
      if (previous?.animations) element.animations = structuredClone(previous.animations);
      if (previous && "retime" in previous && previous.retime && "retime" in element) element.retime = structuredClone(previous.retime);
      if (previous && (previous.type === "video" || previous.type === "image") && (element.type === "video" || element.type === "image")) {
        if (previous.transitionIn) element.transitionIn = structuredClone(previous.transitionIn);
        if (previous.transitionOut) element.transitionOut = structuredClone(previous.transitionOut);
      }
      if (clip.volumeDb !== undefined) element.params.volume = clip.volumeDb;
      applyClipAudioShaping(clip, element);
      putElement(track, element);
    }
    for (const caption of captions) {
      let track = tracks.find(candidate => candidate.id === caption.trackId);
      if (!track) {
        track = { id: caption.trackId, name: "Captions", type: "text", hidden: false, elements: [] };
        scene.tracks.overlay.unshift(track);
        tracks.push(track);
      }
      const previous = track.elements.find(element => element.id === caption.id);
      if (previous && previous.type !== "text") invalid("This caption ID already belongs to a non-text element.");
      const element = buildTextElement({ raw: { name: caption.text, duration: mediaTimeFromSeconds({ seconds: caption.durationSeconds }) }, startTime: mediaTimeFromSeconds({ seconds: caption.startSeconds }) });
      if (element.type !== "text") invalid("Text creation returned an incompatible element.");
      if (previous) element.params = { ...previous.params };
      element.params.content = caption.text;
      element.params.fontSize = (caption.fontSizePx ?? 48) * FONT_SIZE_SCALE_REFERENCE / project.settings.canvasSize.height;
      element.params["transform.positionY"] = caption.positionY ?? project.settings.canvasSize.height * 0.35;
      element.params["background.enabled"] = true;
      putElement(track, { ...element, id: caption.id, trimStart: ZERO_MEDIA_TIME, trimEnd: ZERO_MEDIA_TIME });
    }
    for (const placement of transitions) {
      const edge = placement.edge;
      if (edge !== "in" && edge !== "out") invalid("A transition edge must be \"in\" or \"out\".");
      if (!transitionsRegistry.has(placement.type)) invalid("Unknown transition type.");
      const durationSeconds = placement.durationSeconds ?? DEFAULT_TRANSITION_DURATION_SECONDS;
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) invalid("Transition durations must be positive.");
      const track = tracks.find(candidate => candidate.elements.some(element => element.id === placement.elementId));
      if (!track || track.type !== "video") invalid("A transition must target a clip on the main video track.");
      const target = track.elements.find(element => element.id === placement.elementId);
      if (!target || (target.type !== "video" && target.type !== "image")) invalid("A transition must target a video or image clip.");
      const existing = edge === "in" ? target.transitionIn : target.transitionOut;
      const transition: Transition = {
        id: existing?.id ?? generateUUID(),
        type: placement.type as Transition["type"],
        duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
      };
      if (edge === "in") target.transitionIn = transition; else target.transitionOut = transition;
    }
    // Track mute is the only reason a correctly-levelled clip can still be
    // silent, so the command surface has to be able to clear it.
    for (const update of trackUpdates) {
      const track = tracks.find(candidate => candidate.id === update.id);
      if (!track) invalid("Unknown track ID in a track update.");
      if (update.muted !== undefined) {
        if (!canTrackHaveAudio(track)) invalid("Only video and audio tracks carry a mute state.");
        track.muted = update.muted;
      }
    }
    for (const style of textStyles) {
      const track = tracks.find(candidate => candidate.elements.some(element => element.id === style.elementId));
      if (!track || track.type !== "text") invalid("A text style must target a text element on a text track.");
      const target = track.elements.find(element => element.id === style.elementId);
      if (!target || target.type !== "text") invalid("A text style must target a text element.");
      if (style.stroke) {
        if (style.stroke.color !== undefined) target.params["stroke.color"] = style.stroke.color;
        if (style.stroke.width !== undefined) target.params["stroke.width"] = style.stroke.width;
      }
      if (style.shadow) {
        if (style.shadow.color !== undefined) target.params["shadow.color"] = style.shadow.color;
        if (style.shadow.x !== undefined) target.params["shadow.x"] = style.shadow.x;
        if (style.shadow.y !== undefined) target.params["shadow.y"] = style.shadow.y;
        if (style.shadow.blur !== undefined) target.params["shadow.blur"] = style.shadow.blur;
      }
      if (style.glow) {
        if (style.glow.color !== undefined) target.params["glow.color"] = style.glow.color;
        if (style.glow.radius !== undefined) target.params["glow.radius"] = style.glow.radius;
      }
    }
    const saved = await documents.save({ editId: input.editId, project, expectedRevision: expected });
    revision = saved.revision;
  }
  const saved = await documents.readCurrent(input.editId);
  if (saved?.kind !== "document" || saved.document.revision.digest !== revision.digest) throw new Error("The saved timeline changed during readback; inspect the edit before retrying.");
  return { kind: "json" as const, data: {
    revision: saved.document.revision,
    assets: editor.media.getAssets().map(assetSummary),
    tracks: [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio].map(track => ({ id: track.id, type: track.type, ...(canTrackHaveAudio(track) ? { muted: track.muted } : {}) })),
    elements: saved.document.project.scenes.flatMap(currentScene => [currentScene.tracks.main, ...currentScene.tracks.overlay, ...currentScene.tracks.audio].flatMap(track => track.elements.map(element => elementSummary(element, track.id)))),
  } };
}

export async function editTimeline(input: EditTimelineInput, sdk: ProductionDocumentSdk) {
  try {
    return await applyTimeline(input, sdk);
  } catch (error) {
    if (error instanceof EditRevisionConflictError) {
      throw new ProjectRpcError({
        code: "entity-version-conflict",
        message: "This edit changed. Inspect its current revision before applying your changes.",
        details: { editId: error.editId, expected: error.expected, actual: error.actual },
      });
    }
    throw error;
  }
}
