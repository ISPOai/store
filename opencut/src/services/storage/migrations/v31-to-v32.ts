import { StorageMigration, type StorageMigrationRunArgs } from "./base";
import type { MigrationResult, ProjectRecord } from "./transformers/types";
import type { SerializedProject } from "../types";
import { z } from "zod";

export function transformProjectV31ToV32({
	project,
}: {
	project: SerializedProject;
}): MigrationResult<SerializedProject>;
export function transformProjectV31ToV32({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord>;
export function transformProjectV31ToV32({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	const version = z.number().int().safeParse(project.version);
	if (!version.success) {
		return { project, skipped: true, reason: "invalid version" };
	}
	if (version.data >= 32) {
		return { project, skipped: true, reason: "already v32" };
	}
	if (version.data !== 31) {
		return { project, skipped: true, reason: "not v31" };
	}
	const metadataResult = z
		.object({
			id: z.string().min(1).optional(),
			name: z.string().min(1).optional(),
			createdAt: z.string().min(1).optional(),
			updatedAt: z.string().min(1).optional(),
		})
		.passthrough()
		.safeParse(project.metadata);
	const metadata = metadataResult.success ? metadataResult.data : {};
	const createdAt =
		metadata.createdAt ??
		metadata.updatedAt ??
		"1970-01-01T00:00:00.000Z";
	const updatedAt = metadata.updatedAt ?? createdAt;
	const projectId = z.string().min(1).safeParse(project.id);
	const id =
		metadata.id ?? (projectId.success ? projectId.data : "legacy-project");
	const name = metadata.name ?? "Untitled project";
	return {
		project: {
			...project,
			metadata: {
				...metadata,
				id,
				name,
				createdAt,
				updatedAt,
			},
			version: 32,
		},
		skipped: false,
	};
}

export class V31toV32Migration extends StorageMigration {
	from = 31;
	to = 32;

	async run({
		project,
	}: StorageMigrationRunArgs): Promise<MigrationResult<ProjectRecord>> {
		return transformProjectV31ToV32({ project });
	}
}
