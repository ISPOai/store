import { describe, expect, test } from "bun:test";
import {
	V31toV32Migration,
	transformProjectV31ToV32,
} from "./v31-to-v32";

describe("V31 to V32 migration", () => {
	test("advances the schema version and fills required metadata", async () => {
		const settings = { fps: { numerator: 30, denominator: 1 } };
		const scenes = [{ id: "scene-1", tracks: { main: null } }];
		const project = {
			metadata: { id: "edit-1", name: "Draft" },
			scenes,
			settings,
			version: 31,
		};

		const transformed = transformProjectV31ToV32({ project });
		expect(transformed).toEqual({
			project: {
				...project,
				metadata: {
					...project.metadata,
					createdAt: "1970-01-01T00:00:00.000Z",
					updatedAt: "1970-01-01T00:00:00.000Z",
				},
				version: 32,
			},
			skipped: false,
		});
		expect(transformed.project.scenes).toBe(scenes);
		expect(transformed.project.settings).toBe(settings);
		expect("timelineViewState" in transformed.project).toBe(false);

		const migration = new V31toV32Migration();
		const rerun = await migration.run({
			projectId: "edit-1",
			project: transformed.project,
		});
		expect(rerun.skipped).toBe(true);
		expect(rerun.reason).toBe("already v32");
		expect(rerun.project).toBe(transformed.project);
	});

	test("fails closed for malformed and unexpected source versions", () => {
		const malformed = { metadata: { id: "edit-1" } };
		const old = { metadata: { id: "edit-1" }, version: 30 };

		expect(transformProjectV31ToV32({ project: malformed })).toEqual({
			project: malformed,
			skipped: true,
			reason: "invalid version",
		});
		expect(transformProjectV31ToV32({ project: old })).toEqual({
			project: old,
			skipped: true,
			reason: "not v31",
		});
	});
});
