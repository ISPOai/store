import { whenEditorReady } from "./editor-ready";
import { navigateToEditorProject } from "@/lib/next-stubs/navigation";
import { ProjectRpcError } from "@ispo/sdk";
import { EditorCore } from "@/core";
import {
	ProductionDocumentService,
	type ProductionDocumentSdk,
} from "@/project/production-document-service";
import {
	EditRevisionConflictError,
	type EditRevision,
} from "@/project/production-types";
import type { ImageElement, VideoElement } from "@/timeline";
import {
	readCropFromParams,
	readFlipFromParams,
	writeCropToParams,
	writeFlipToParams,
} from "@/crop/crop";
import type { CropRect } from "@/services/renderer/image-fit";

export interface SetClipCropInput {
	editId: string;
	expectedRevision?: EditRevision;
	trackId: string;
	elementId: string;
	/** Normalized per-edge crop in [0,1]. */
	crop?: CropRect;
	flipX?: boolean;
	flipY?: boolean;
}

function invalid(message: string): never {
	throw new ProjectRpcError({ code: "input-invalid", message });
}

function isCroppable(element: unknown): element is VideoElement | ImageElement {
	return (
		typeof element === "object" &&
		element !== null &&
		"type" in element &&
		(element.type === "video" || element.type === "image")
	);
}

async function applySetClipCrop(input: SetClipCropInput, sdk: ProductionDocumentSdk) {
	const editor = EditorCore.getInstance();
	const documents = new ProductionDocumentService(sdk);
	const current = await documents.readCurrent(input.editId);
	if (current?.kind !== "document") invalid("A saved edit is required.");
	if (editor.project.getActiveOrNull()?.metadata.id !== input.editId) {
		await editor.save.flush();
		navigateToEditorProject(input.editId);
		await whenEditorReady(input.editId);
	}

	if (!input.crop && input.flipX === undefined && input.flipY === undefined) {
		invalid("Provide crop, flipX, or flipY.");
	}

	const project = structuredClone(current.document.project);
	const scene = project.scenes.find((candidate) => candidate.id === project.currentSceneId);
	if (!scene) invalid("The edit has no active scene.");
	const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
	const track = tracks.find((candidate) => candidate.id === input.trackId);
	if (!track) invalid("The selected track does not exist.");
	const element = track.elements.find((candidate) => candidate.id === input.elementId);
	if (!element) invalid("The selected element does not exist on that track.");
	if (!isCroppable(element)) invalid("Only video and image clips support crop and flip.");

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

	let params = element.params;
	if (input.crop) {
		params = writeCropToParams({ params, crop: input.crop });
	}
	if (input.flipX !== undefined || input.flipY !== undefined) {
		const flip = readFlipFromParams({ params: element.params });
		params = writeFlipToParams({
			params,
			flipX: input.flipX ?? flip.flipX,
			flipY: input.flipY ?? flip.flipY,
		});
	}
	element.params = params;

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
			crop: readCropFromParams({ params: element.params }),
			flipX: readFlipFromParams({ params: element.params }).flipX,
			flipY: readFlipFromParams({ params: element.params }).flipY,
		},
	};
}

export async function setClipCrop(input: SetClipCropInput, sdk: ProductionDocumentSdk) {
	try {
		return await applySetClipCrop(input, sdk);
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
