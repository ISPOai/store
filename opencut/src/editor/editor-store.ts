import { create } from "zustand";
import { DEFAULT_CANVAS_PRESETS } from "@/canvas/sizes";
import type { TCanvasSize } from "@/project/types";
import type { DocumentSaveStatus } from "@/project/production-types";

interface EditorState {
	isInitializing: boolean;
	isPanelsReady: boolean;
	canvasPresets: TCanvasSize[];
	documentSaveStatus: DocumentSaveStatus;
	setInitializing: (loading: boolean) => void;
	setPanelsReady: (ready: boolean) => void;
	initializeApp: () => Promise<void>;
	setDocumentSaveStatus: (status: DocumentSaveStatus) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
	isInitializing: true,
	isPanelsReady: false,
	canvasPresets: DEFAULT_CANVAS_PRESETS,
	documentSaveStatus: { kind: "clean", revision: null },
	setInitializing: (loading) => set({ isInitializing: loading }),
	setPanelsReady: (ready) => set({ isPanelsReady: ready }),
	setDocumentSaveStatus: (documentSaveStatus) => set({ documentSaveStatus }),
	initializeApp: async () => {
		set({ isInitializing: true, isPanelsReady: false });
		set({ isPanelsReady: true, isInitializing: false });
	},
}));
