import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { EditRevisionConflictError, type EditRevision } from "@/project/production-types";
import { canElementHaveAudio } from "@/timeline/element-utils";
import { mediaTimeToSeconds } from "@/wasm";

export interface SetClipFadeInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	fadeInSeconds?: number;
	fadeOutSeconds?: number;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

async function applySetClipFade(input: SetClipFadeInput, sdk: ProductionDocumentSdk) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") invalid("A saved edit is required.");
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}

	const hasFadeIn = input.fadeInSeconds !== undefined;
	const hasFadeOut = input.fadeOutSeconds !== undefined;
	if (!hasFadeIn && !hasFadeOut) invalid("Provide fadeInSeconds, fadeOutSeconds, or both.");
	for (const value of [input.fadeInSeconds, input.fadeOutSeconds]) {
		if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
			invalid("Fade durations must be finite nonnegative seconds.");
		}
	}

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find((candidate) => candidate.id === project.currentSceneId);
	if (!scene) invalid("The edit has no active scene.");
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) invalid("The selected track does not exist.");
	const element = track.elements.find((candidate) => candidate.id === input.elementId);
	if (!element) invalid("The selected element does not exist on that track.");
	if (!canElementHaveAudio(element)) invalid("Only audio and video clips support fades.");

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

	const clipDurationSeconds = mediaTimeToSeconds({ time: element.duration });
	const fadeInSeconds =
		input.fadeInSeconds !== undefined
			? Math.min(clipDurationSeconds, input.fadeInSeconds)
			: undefined;
	const fadeOutSeconds =
		input.fadeOutSeconds !== undefined
			? Math.min(clipDurationSeconds, input.fadeOutSeconds)
			: undefined;

	if (fadeInSeconds !== undefined) element.params.fadeInSeconds = fadeInSeconds;
	if (fadeOutSeconds !== undefined) element.params.fadeOutSeconds = fadeOutSeconds;

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
			fadeInSeconds: fadeInSeconds ?? 0,
			fadeOutSeconds: fadeOutSeconds ?? 0,
		},
	};
}

export async function setClipFade(input: SetClipFadeInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipFade(input, sdk);
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
