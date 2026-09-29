import type { EditorCore } from "@/core";

// UI-only readiness for domain functions called by mounted editor controls.
// The headless command exposure does not import this module or these functions.

const READY_TIMEOUT_MS = 15_000;

let readyEditor: EditorCore | null = null;
const waiters = new Set<(editor: EditorCore) => void>();

export function markEditorReady(editor: EditorCore): () => void {
	readyEditor = editor;
	for (const accept of [...waiters]) accept(editor);
	return () => {
		if (readyEditor === editor) readyEditor = null;
	};
}

export function whenEditorReady(editId?: string): Promise<EditorCore> {
	if (readyEditor && (!editId || readyEditor.project.getActiveOrNull()?.metadata.id === editId)) return Promise.resolve(readyEditor);
	return new Promise((resolve, reject) => {
		let settled = false;
		const accept = (editor: EditorCore) => {
			if (settled || (editId && editor.project.getActiveOrNull()?.metadata.id !== editId)) return;
			settled = true;
			clearTimeout(timer);
			waiters.delete(accept);
			resolve(editor);
		};
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			waiters.delete(accept);
			reject(
				new Error(
					"OpenCut is still loading its project. Keep OpenCut available and retry once the editor has finished loading.",
				),
			);
		}, READY_TIMEOUT_MS);
		waiters.add(accept);
		if (readyEditor) accept(readyEditor);
	});
}
