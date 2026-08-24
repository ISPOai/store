import { commands } from "@ispo/sdk";

// ───────────────────────────────────────────────────────────────────────────
// The one code-first use case OpenCut exposes to the host: what edits are
// saved here?
//
// It reads the same `projects/<id>.json` documents SdkAdapter writes (see
// services/storage/sdk-adapter.ts), but goes through `ctx.sdk.fs` rather than
// storageService. storageService holds the ambient SDK singleton, which would
// drop the host-minted invocation attribution this handler must carry.
// ───────────────────────────────────────────────────────────────────────────

const PROJECTS_DIRECTORY = "projects";
const JSON_SUFFIX = ".json";
const MAX_PROJECTS = 100;

type StoredProject = {
	metadata?: {
		id?: unknown;
		name?: unknown;
		duration?: unknown;
		updatedAt?: unknown;
	};
};

type ProjectSummary = {
	id: string;
	name: string;
	updatedAt: string;
	durationSeconds?: number;
};

// A half-written or hand-edited document is skipped, never fatal: one bad file
// must not make the whole listing fail.
function summarize(raw: string, fallbackId: string): ProjectSummary | null {
	let parsed: StoredProject;
	try {
		parsed = JSON.parse(raw) as StoredProject;
	} catch {
		return null;
	}
	const metadata = parsed.metadata;
	if (typeof metadata !== "object" || metadata === null) return null;
	const id = typeof metadata.id === "string" ? metadata.id : fallbackId;
	const name = typeof metadata.name === "string" ? metadata.name : "Untitled project";
	const updatedAt = typeof metadata.updatedAt === "string" ? metadata.updatedAt : "";
	const duration = typeof metadata.duration === "number" ? metadata.duration : undefined;
	return {
		id,
		name,
		updatedAt,
		...(duration !== undefined ? { durationSeconds: duration } : {}),
	};
}

export const listVideoProjectsCommand = commands.define(
	{
		id: "list-video-projects",
		label: "List video projects",
		description:
			"List the video projects saved in this editor, most recently edited first, with their durations.",
		promptExamples: ["What videos am I editing?", "List my OpenCut projects"],
		inputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				limit: { type: "number", minimum: 1, maximum: 100 },
			},
		},
		resultSchema: {
			type: "object",
			additionalProperties: false,
			required: ["kind", "data"],
			properties: {
				kind: { const: "json" },
				data: {
					type: "object",
					additionalProperties: false,
					required: ["count", "projects"],
					properties: {
						count: { type: "number" },
						projects: {
							type: "array",
							maxItems: 100,
							items: {
								type: "object",
								additionalProperties: false,
								required: ["id", "name", "updatedAt"],
								properties: {
									id: { type: "string", minLength: 1, maxLength: 512 },
									name: { type: "string", maxLength: 512 },
									updatedAt: { type: "string", maxLength: 64 },
									durationSeconds: { type: "number" },
								},
							},
						},
					},
				},
			},
		},
		invocationMode: "iframe-action",
		resultChannels: ["json"],
		aliases: ["my video projects"],
	},
	async (input, ctx) => {
		// No `projects/` directory yet is the ordinary empty first run.
		let entries: string[] = [];
		try {
			entries = await ctx.sdk.fs.list(PROJECTS_DIRECTORY);
		} catch {
			entries = [];
		}

		const summaries: ProjectSummary[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(JSON_SUFFIX) || entry.endsWith("/")) continue;
			const key = entry.slice(0, -JSON_SUFFIX.length);
			try {
				const summary = summarize(
					await ctx.sdk.fs.read(`${PROJECTS_DIRECTORY}/${entry}`),
					key,
				);
				if (summary) summaries.push(summary);
			} catch {
				// Unreadable entry — skip it rather than fail the listing.
			}
		}

		summaries.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
		const limit = Math.min(input.limit ?? MAX_PROJECTS, MAX_PROJECTS);
		return {
			kind: "json" as const,
			data: {
				count: summaries.length,
				projects: summaries.slice(0, limit),
			},
		};
	},
);

export const projectCommands = commands.expose([listVideoProjectsCommand]);

// The listing reads durable files directly, so nothing has to hydrate before a
// host call can be served.
projectCommands.ready();
