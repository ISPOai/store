import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import { ProductionDocumentService, type ProductionDocumentSdk } from "@/project/production-document-service";
import { EditRevisionConflictError, type EditRevision } from "@/project/production-types";
import { canElementHaveAudio } from "@/timeline";
import {
	DEFAULT_NORMALIZATION_TARGET,
	computeNormalizedVolume,
	isNormalizationTargetLufs,
	measureTargetsLoudness,
	type NormalizedElementResult,
} from "@/media/loudness/normalize";

export interface NormalizeLoudnessTargetInput {
	trackId: string;
	elementId: string;
}

export interface NormalizeLoudnessInput {
	editId: string;
	expectedRevision?: EditRevision;
	targets: NormalizeLoudnessTargetInput[];
	targetLufs?: number;
}

const MEDIA_LOAD_TIMEOUT_MS = 15_000;

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

async function waitForMediaLoaded({ editor }: { editor: EditorCore }): Promise<void> {
	const startedAt = Date.now();
	while (editor.media.isLoadingMedia()) {
		if (Date.now() - startedAt > MEDIA_LOAD_TIMEOUT_MS) {
			invalid(
				"OpenCut is still loading its media library. Wait for it to finish, then retry.",
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

async function applyNormalizeLoudness(
	input: NormalizeLoudnessInput,
	sdk: ProductionDocumentSdk,
) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") invalid("A saved edit is required.");
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}
	await waitForMediaLoaded({ editor });

	const mediaAssets = editor.media.getAssets();
	if (mediaAssets.length === 0) {
		invalid(
			"No media is loaded in the open OpenCut project. Wait for the media library to finish loading, then retry.",
		);
	}

	const targetLufs = input.targetLufs ?? DEFAULT_NORMALIZATION_TARGET;
	if (!isNormalizationTargetLufs(targetLufs)) {
		invalid("targetLufs must be one of -14, -16, or -23.");
	}

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

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find(
		(candidate) => candidate.id === project.currentSceneId,
	);
	if (!scene) invalid("The edit has no active scene.");

	const orderedTracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];
	const resolved = input.targets.map((target) => {
		const track = orderedTracks.find((candidate) => candidate.id === target.trackId);
		const element = track?.elements.find((candidate) => candidate.id === target.elementId);
		if (!track || !element) {
			invalid(`No element "${target.elementId}" exists on track "${target.trackId}".`);
		}
		if (!canElementHaveAudio(element)) {
			invalid("Only audio and video clips support loudness normalization.");
		}
		return { track, element };
	});

	const measurements = await measureTargetsLoudness({
		tracks: scene.tracks,
		mediaAssets,
		targets: input.targets,
	});

	const results: NormalizedElementResult[] = [];
	for (const { track, element } of resolved) {
		const measurement = measurements.get(element.id);
		if (!measurement) {
			invalid(
				`Cannot measure the audio of "${element.name}". Make sure the clip has enabled, audible audio and retry.`,
			);
		}
		const { previousVolumeDb, appliedGainDb, nextVolumeDb } =
			computeNormalizedVolume({ element, measurement, targetLufs });
		if (nextVolumeDb === null) {
			invalid(
				`The audio of "${element.name}" is silent and cannot be normalized.`,
			);
		}
		element.params = { ...element.params, volume: nextVolumeDb };
		results.push({
			trackId: track.id,
			elementId: element.id,
			measuredLufs: measurement.integratedLufs,
			appliedGainDb,
			previousVolumeDb,
			nextVolumeDb,
		});
	}

	const saved = await documents.save({
		editId: input.editId,
		project,
		expectedRevision: expected,
	});

	return {
		kind: "json" as const,
		data: {
			revision: saved.revision,
			targetLufs,
			results,
		},
	};
}

export async function normalizeLoudness(
	input: NormalizeLoudnessInput,
	sdk: ProductionDocumentSdk,
) {
	try {
		return await applyNormalizeLoudness(input, sdk);
	} catch (error) {
		if (error instanceof EditRevisionConflictError) {
			throw new ProjectRpcError({
				code: "entity-version-conflict",
				message:
					"This edit changed. Inspect its current revision before applying your changes.",
				details: {
					editId: error.editId,
					expected: error.expected,
					actual: error.actual,
				},
			});
		}
		throw error;
	}
}
