import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { EditRevisionConflictError, type EditRevision } from "@/project/production-types";
import type { RetimeConfig, SpeedCurveKeyframe } from "@/timeline";
import { isRetimableElement } from "@/timeline";
import {
	buildConstantRetime,
	buildCustomSpeedCurveRetime,
	buildSpeedCurvePreset,
	getSourceSpanAtClipTime,
	getTimelineDurationForSourceSpan,
	isSpeedCurvePresetName,
} from "@/retime";
import { mediaTimeToSeconds, roundMediaTime } from "@/wasm";
import { generateUUID } from "@/utils/id";

export interface SpeedCurveKeyframeInput {
	time: number;
	rate: number;
	segmentToNext?: SpeedCurveKeyframe["segmentToNext"];
}

export interface SetClipSpeedInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** Constant speed. Mutually exclusive with `curve`. */
	speed?: { rate: number; maintainPitch?: boolean };
	/** Velocity curve: either a named preset or an explicit keyframe list. */
	curve?: { preset: string } | { keyframes: SpeedCurveKeyframeInput[] };
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function toKeyframes(keyframes: SpeedCurveKeyframeInput[]): SpeedCurveKeyframe[] {
	return keyframes.map((key) => ({
		id: generateUUID(),
		time: key.time,
		rate: key.rate,
		segmentToNext: key.segmentToNext ?? "linear",
	}));
}

function resolveRetime(input: SetClipSpeedInput): RetimeConfig | undefined {
	const maintainPitch = input.speed?.maintainPitch ?? false;

	if (input.curve) {
		if ("preset" in input.curve) {
			if (!isSpeedCurvePresetName(input.curve.preset)) {
				invalid(`Unknown speed-curve preset: ${String(input.curve.preset)}`);
			}
			return buildSpeedCurvePreset({ name: input.curve.preset, maintainPitch });
		}
		const keyframes = toKeyframes(input.curve.keyframes);
		if (keyframes.length === 0) {
			invalid("A custom speed curve needs at least one keyframe.");
		}
		return buildCustomSpeedCurveRetime({ curve: keyframes, maintainPitch });
	}

	if (input.speed) {
		if (!Number.isFinite(input.speed.rate) || input.speed.rate <= 0) {
			invalid("Speed rate must be a finite positive number.");
		}
		return buildConstantRetime({ rate: input.speed.rate, maintainPitch });
	}

	return undefined;
}

async function applySetClipSpeed(input: SetClipSpeedInput, sdk: ProductionDocumentSdk) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") invalid("A saved edit is required.");
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}

	if (input.curve && input.speed) invalid("Provide either speed or curve, not both.");

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find((candidate) => candidate.id === project.currentSceneId);
	if (!scene) invalid("The edit has no active scene.");
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) invalid("The selected track does not exist.");
	const element = track.elements.find((candidate) => candidate.id === input.elementId);
	if (!element) invalid("The selected element does not exist on that track.");
	if (!isRetimableElement(element)) invalid("Only video and audio clips support speed changes.");

	const expected = input.expectedRevision;
	if (!expected) invalid("Read the timeline and pass its exact revision before editing.");
	if (
		expected.editId !== current.document.revision.editId ||
		expected.storageCasRevision !== current.document.revision.storageCasRevision ||
		expected.intentRevision !== current.document.revision.intentRevision ||
		expected.digest !== current.document.revision.digest
	) {
		throw new EditRevisionConflictError({
			editId: input.editId,
			expected,
			actual: current.document.revision,
		});
	}

	const nextRetime = resolveRetime(input);

	const sourceDuration =
		element.sourceDuration ??
		(element.trimStart +
			getSourceSpanAtClipTime({
				clipTime: element.duration,
				retime: element.retime,
				clipDuration: element.duration,
			}) +
			element.trimEnd);
	const visibleSourceSpan = Math.max(0, sourceDuration - element.trimStart - element.trimEnd);
	const nextDuration = roundMediaTime({
		time: getTimelineDurationForSourceSpan({ sourceSpan: visibleSourceSpan, retime: nextRetime }),
	});

	element.retime = nextRetime;
	element.duration = nextDuration;

	const saved = await documents.save({
		editId: input.editId,
		project,
		expectedRevision: expected,
	});

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			elementId: element.id,
			trackId: track.id,
			retime: nextRetime ?? null,
			durationSeconds: mediaTimeToSeconds({ time: nextDuration }),
		},
	};
}

export async function setClipSpeed(input: SetClipSpeedInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipSpeed(input, sdk);
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
