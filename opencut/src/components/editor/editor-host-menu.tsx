"use client";

import { useHostMenu } from "@ispo/sdk/react";
import { useEditorChromeStore } from "@/components/editor/editor-chrome-store";
import { useEditor } from "@/editor/use-editor";
import { ProjectChooserDialog } from "@/project/components/project-chooser";
import { ExportPopover } from "@/components/editor/export-button";

export function EditorHostMenu() {
	const setProjectDialogOpen = useEditorChromeStore(
		(state) => state.setProjectDialogOpen,
	);
	const setExportPopoverOpen = useEditorChromeStore(
		(state) => state.setExportPopoverOpen,
	);
	const activeProject = useEditor((editor) =>
		editor.project.getActiveOrNull()?.metadata,
	);

	useHostMenu({
		title: activeProject?.name,
		menus: [
			{
				label: "File",
				items: [
					{
						id: "projects",
						label: "Projects…",
						onSelect: () => setProjectDialogOpen(true),
					},
					{ type: "separator" },
					{
						id: "export",
						label: "Export…",
						disabled: !activeProject,
						onSelect: () => setExportPopoverOpen(true),
					},
				],
			},
		],
	});

	return (
		<>
			<ProjectChooserDialog />
			<ExportPopover />
		</>
	);
}
