import { navigateToEditorProject } from "next/navigation";

import { EditorCore } from "@/core";

export interface CreateProjectData {
	projectId: string;
	name: string;
}

export interface CreateProjectInput {
	name?: string;
}

export const DEFAULT_PROJECT_NAME = "Untitled Project";

function normalizeCreateProjectName({ input }: { input: CreateProjectInput }): string {
	return input.name?.trim() || DEFAULT_PROJECT_NAME;
}

/**
 * Runtime entry for the `create-project` command (metadata lives in
 * `@/services/project-commands`). Initializes a new project through the same
 * ProjectManager path the UI uses, persists it through the Entity-backed
 * storage service, and points the route store at the new project.
 */
export async function runCreateProject(
	input: CreateProjectInput,
): Promise<CreateProjectData> {
	const name = normalizeCreateProjectName({ input });
	const editor = EditorCore.getInstance();

	const projectId = await editor.project.createNewProject({ name });
	const project = editor.project.getActive();

	// Keep the route store (and its localStorage persistence) pointing at the
	// new project so a reload doesn't reopen the previous one.
	navigateToEditorProject(projectId);

	return { projectId, name: project.metadata.name };
}
