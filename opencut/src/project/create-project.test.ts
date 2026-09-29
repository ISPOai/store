import { describe, expect, mock, test } from "bun:test";

const createNewProject = mock(async (_input: { name: string }) => {
	return "project-created";
});
const getActive = mock(() => ({ metadata: { name: "New edit" } }));
const navigateToEditorProject = mock((_projectId: string) => undefined);

mock.module("@/core", () => ({
	EditorCore: {
		getInstance: () => ({
			project: { createNewProject, getActive },
		}),
	},
}));
mock.module("next/navigation", () => ({ navigateToEditorProject }));
mock.module("opencut-wasm", () => ({
	TICKS_PER_SECOND: () => 30_000,
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) => Math.round(seconds * 30_000),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 30_000,
	lastFrameTime: ({ duration }: { duration: number }) => duration,
	parseTimecode: () => undefined,
	roundToFrame: ({ time }: { time: number }) => time,
	snappedSeekTime: ({ time }: { time: number }) => time,
}));

const { createProjectCommand } = await import("@/services/project-commands");

describe("create-project command", () => {
	test("keeps its contract and dispatches through ProjectManager", async () => {
		expect(createProjectCommand.invocationMode).toBe("iframe-action");
		expect(createProjectCommand.confirmation).toBe("confirm");
		expect(createProjectCommand.inputSchema).toMatchObject({
			type: "object",
			additionalProperties: false,
			properties: { name: { type: "string", minLength: 1, maxLength: 200 } },
		});
		expect(createProjectCommand.resultSchema).toMatchObject({
			type: "object",
			properties: {
				kind: { const: "json" },
				data: {
					type: "object",
					required: ["projectId", "name"],
				},
			},
		});
		expect(createProjectCommand.description).toContain("mounted editor");
		expect(createProjectCommand.description).not.toContain("headless");

		const result = await createProjectCommand.run({ name: "New edit" });

		expect(createNewProject).toHaveBeenCalledWith({ name: "New edit" });
		expect(getActive).toHaveBeenCalledTimes(1);
		expect(navigateToEditorProject).toHaveBeenCalledWith("project-created");
		expect(result).toEqual({
			kind: "json",
			data: { projectId: "project-created", name: "New edit" },
		});
	});
});
