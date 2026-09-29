"use client";

import { create } from "zustand";

interface EditorChromeStore {
	projectDialogOpen: boolean;
	setProjectDialogOpen: (open: boolean) => void;
	exportPopoverOpen: boolean;
	setExportPopoverOpen: (open: boolean) => void;
}

export const useEditorChromeStore = create<EditorChromeStore>((set) => ({
	projectDialogOpen: false,
	setProjectDialogOpen: (open) => set({ projectDialogOpen: open }),
	exportPopoverOpen: false,
	setExportPopoverOpen: (open) => set({ exportPopoverOpen: open }),
}));
