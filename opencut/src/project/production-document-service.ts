import { entities, files, ProjectRpcError } from "@ispo/sdk";
import {
	SdkAdapter,
	type EntityStorageApi,
	type FilesStorageApi,
} from "@/services/storage/sdk-adapter";
import type { SerializedProject } from "@/services/storage/types";
import { transformProjectV31ToV32 } from "@/services/storage/migrations/v31-to-v32";
import {
	rememberProjectName,
	resolveProjectFolder,
} from "@/services/storage/project-folder";
import type {
	EditRevision,
	LoadedProductionDocument,
	ProductionDocumentCurrentRead,
	PublishedEditRevision,
	StoredEditSnapshot,
	StoredProductionDocument,
} from "./production-types";
import {
	EditRevisionConflictError,
	LegacyEditRevisionConflictError,
} from "./production-types";

const PROJECT_ENTITY_TYPE = "opencut.project";
const RECENT_INTENT_SNAPSHOT_LIMIT = 5;
// Leave room below the host's 10,000-node input limit for the entity envelope.
const RECENT_HISTORY_NODE_BUDGET = 8_000;
const ACTIVE_EDIT_STORAGE_KEY = "opencut.active-project-id";
const MAX_EDIT_LIST_SIZE = 50;

export class ProductionDocumentLosslessJsonError extends Error {
	constructor(
		readonly path: string,
		readonly reason: string,
	) {
		super(`Production document contains ${reason} at ${path}`);
		this.name = "ProductionDocumentLosslessJsonError";
	}
}

function propertyPath(path: string, key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
		? `${path}.${key}`
		: `${path}[${JSON.stringify(key)}]`;
}

function normalizeLosslessJson(value: unknown, path: string, active: WeakMap<object, string>): unknown {
	if (value === undefined) {
		if (path === "$") throw new ProductionDocumentLosslessJsonError(path, "an undefined root value");
		return undefined;
	}
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new ProductionDocumentLosslessJsonError(path, "a non-finite number");
		return value;
	}
	if (typeof value === "bigint") throw new ProductionDocumentLosslessJsonError(path, "a bigint");
	if (typeof value === "function") throw new ProductionDocumentLosslessJsonError(path, "a function");
	if (typeof value === "symbol") throw new ProductionDocumentLosslessJsonError(path, "a symbol");
	if (value instanceof Date) throw new ProductionDocumentLosslessJsonError(path, "a Date");
	if (value instanceof Map) throw new ProductionDocumentLosslessJsonError(path, "a Map");
	if (value instanceof Set) throw new ProductionDocumentLosslessJsonError(path, "a Set");

	if (active.has(value)) {
		throw new ProductionDocumentLosslessJsonError(path, `a cycle to ${active.get(value)}`);
	}
	active.set(value, path);
	try {
		if (Array.isArray(value)) {
			const normalized: unknown[] = [];
			for (let index = 0; index < value.length; index += 1) {
				if (!Object.prototype.hasOwnProperty.call(value, index)) continue;
				const item = normalizeLosslessJson(value[index], `${path}[${index}]`, active);
				if (item !== undefined) normalized.push(item);
			}
			return normalized;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new ProductionDocumentLosslessJsonError(path, "an unsupported object");
		}
		const normalized: Record<string, unknown> = {};
		const objectValue = value as Record<string, unknown>;
		for (const key of Object.keys(objectValue)) {
			const item = normalizeLosslessJson(objectValue[key], propertyPath(path, key), active);
			if (item !== undefined) normalized[key] = item;
		}
		return normalized;
	} finally {
		active.delete(value);
	}
}

export function toLosslessJson<T>(value: T): T {
	return normalizeLosslessJson(value, "$", new WeakMap<object, string>()) as T;
}

export interface ProductionDocumentSdk {
	entities: EntityStorageApi;
	files: FilesStorageApi;
}

export interface ProductionEditListEntry {
	editId: string;
	name: string;
	updatedAt: string;
	active: boolean;
}

export interface ProductionEditListing {
	edits: ProductionEditListEntry[];
	activeEditId?: string;
	activeRevision?: EditRevision;
	activeLegacyStorageCasRevision?: string;
	activeEditSource: "storage" | "most-recent";
}

function readPersistedActiveEditId(): { reachable: boolean; editId?: string } {
	try {
		const storage = globalThis.localStorage;
		if (!storage) return { reachable: false };
		const value = storage?.getItem(ACTIVE_EDIT_STORAGE_KEY)?.trim();
		return { reachable: true, ...(value ? { editId: value } : {}) };
	} catch {
		return { reachable: false };
	}
}

function isStoredDocument(
	value: SerializedProject | StoredProductionDocument,
): value is StoredProductionDocument {
	return "kind" in value && value.kind === "opencut.production-document";
}

type ProjectIntentValue = Omit<SerializedProject, "metadata" | "timelineViewState"> & {
	metadata: Omit<SerializedProject["metadata"], "thumbnail" | "updatedAt">;
};

function projectIntentValue(project: SerializedProject): ProjectIntentValue {
	const { thumbnail: _thumbnail, updatedAt: _updatedAt, ...metadata } =
		project.metadata;
	const { timelineViewState: _timelineViewState, ...intent } = project;
	return { ...intent, metadata };
}

function canonicalIntentJson(value: ProjectIntentValue): string {
	return JSON.stringify(value, (_key, nested) => {
		if (nested === null || Array.isArray(nested) || typeof nested !== "object") {
			return nested;
		}
		return Object.fromEntries(
			Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)),
		);
	});
}

async function digestProject(project: SerializedProject): Promise<string> {
	const bytes = new TextEncoder().encode(canonicalIntentJson(projectIntentValue(project)));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function cloneProject(project: SerializedProject): SerializedProject {
	return structuredClone(project);
}

function revisionProject(project: SerializedProject): SerializedProject {
	const cloned = cloneProject(project);
	if (cloned.metadata?.thumbnail !== undefined) {
		delete cloned.metadata.thumbnail;
	}
	delete cloned.timelineViewState;
	return cloned;
}

function referencedIntentRevisions(snapshot: StoredEditSnapshot): Set<string> {
	const references = new Set<string>();
	const state = snapshot.project.settings.production;
	if (!state) return references;
	if (state.accepted) {
		references.add(state.accepted.reference.documentIntentRevision);
	}
	for (const accepted of state.acceptedHistory ?? []) {
		references.add(accepted.reference.documentIntentRevision);
	}
	for (const receipt of state.acceptanceReceipts) {
		references.add(receipt.reference.documentIntentRevision);
	}
	for (const intent of state.actionIntents) {
		references.add(intent.documentIntentRevision);
	}
	return references;
}

function revisionedDocument(
	document: StoredProductionDocument,
	snapshots: StoredEditSnapshot[],
): StoredProductionDocument {
	return {
		...document,
		...revisionProject(document),
		snapshots,
	};
}

// The current snapshot can reference the root project instead of duplicating it.
// Older snapshots retain their complete project and revision digest.
type StoredDocumentWire = Omit<StoredProductionDocument, "snapshots"> & {
	snapshots: Array<Omit<StoredEditSnapshot, "project"> & {
		project?: SerializedProject;
		currentProject?: true;
	}>;
};

function encodeDocument(document: StoredProductionDocument): StoredDocumentWire {
	if (serializedDocumentNodes(document) <= RECENT_HISTORY_NODE_BUDGET) return document;
	return {
		...document,
		snapshots: document.snapshots.map((snapshot) =>
			snapshot.intentRevision === document.currentIntentRevision
				? { intentRevision: snapshot.intentRevision, digest: snapshot.digest, currentProject: true as const }
				: snapshot),
	};
}

function decodeDocument(value: SerializedProject | StoredDocumentWire): SerializedProject | StoredProductionDocument {
	if (!("kind" in value) || value.kind !== "opencut.production-document" || !("snapshots" in value)) return value;
	const document = value;
	const { kind: _kind, formatVersion: _format, editId: _editId,
		currentIntentRevision: _current, snapshots: _snapshots, derived: _derived, ...project } = document;
	return {
		...document,
		snapshots: document.snapshots.map((snapshot) => {
			if (snapshot.project) return { intentRevision: snapshot.intentRevision, digest: snapshot.digest, project: snapshot.project };
			if (snapshot.currentProject !== true || snapshot.intentRevision !== document.currentIntentRevision) {
				throw new Error(`Edit ${document.editId} has an invalid snapshot reference`);
			}
			return { intentRevision: snapshot.intentRevision, digest: snapshot.digest, project: revisionProject(project) };
		}),
	};
}

function withDerivedData(
	document: StoredProductionDocument,
	{
		thumbnail,
		timelineViewState,
	}: {
		thumbnail?: string;
		timelineViewState?: NonNullable<SerializedProject["timelineViewState"]>;
	},
): StoredProductionDocument {
	const next = { ...document };
	const derived = { ...next.derived };
	if (thumbnail === undefined) delete derived.thumbnail;
	else derived.thumbnail = thumbnail;
	if (timelineViewState === undefined) delete derived.timelineViewState;
	else derived.timelineViewState = structuredClone(timelineViewState);
	if (Object.keys(derived).length === 0) delete next.derived;
	else next.derived = derived;
	return next;
}

function serializedDocumentNodes(document: StoredProductionDocument): number {
	let nodes = 0;
	JSON.stringify(document, (_key, value) => {
		nodes += 1;
		return value;
	});
	return nodes;
}

async function compactDocument(
	document: StoredProductionDocument,
): Promise<StoredProductionDocument> {
	const required = new Set<string>([document.currentIntentRevision]);
	for (const snapshot of document.snapshots) {
		for (const revision of referencedIntentRevisions(snapshot)) {
			required.add(revision);
		}
	}
	const recent = document.snapshots.slice(-RECENT_INTENT_SNAPSHOT_LIMIT);
	const retained = document.snapshots.filter(
		(snapshot) =>
			required.has(String(snapshot.intentRevision)) || recent.includes(snapshot),
	);
	const snapshots = await Promise.all(
		retained.map(async (snapshot) => {
			const project = revisionProject(snapshot.project);
			return {
				intentRevision: String(snapshot.intentRevision),
				digest: await digestProject(project),
				project,
			};
		}),
	);
	let compacted = revisionedDocument(document, snapshots);
	while (serializedDocumentNodes(compacted) > RECENT_HISTORY_NODE_BUDGET) {
		const oldestOptional = snapshots.findIndex(
			(snapshot) => !required.has(snapshot.intentRevision),
		);
		if (oldestOptional < 0) break;
		snapshots.splice(oldestOptional, 1);
		compacted = revisionedDocument(document, snapshots);
	}
	return compacted;
}

function hasSameIntent(
	left: SerializedProject,
	right: SerializedProject,
): boolean {
	return canonicalIntentJson(projectIntentValue(left)) ===
		canonicalIntentJson(projectIntentValue(right));
}

function currentSnapshot(
	document: StoredProductionDocument,
): StoredEditSnapshot {
	const snapshot = document.snapshots.find(
		(candidate) =>
			String(candidate.intentRevision) === String(document.currentIntentRevision),
	);
	if (!snapshot) {
		throw new Error(`Edit ${document.editId} has no current snapshot`);
	}
	return snapshot;
}

function loadedDocument({
	document,
	entityVersion,
	thumbnail,
	timelineViewState,
}: {
	document: StoredProductionDocument;
	entityVersion: number;
	thumbnail?: string;
	timelineViewState?: NonNullable<SerializedProject["timelineViewState"]>;
}): LoadedProductionDocument {
	const snapshot = currentSnapshot(document);
	const project = revisionProject(snapshot.project);
	if (thumbnail !== undefined) project.metadata.thumbnail = thumbnail;
	if (timelineViewState !== undefined) project.timelineViewState = structuredClone(timelineViewState);
	return {
		revision: {
			editId: document.editId,
			storageCasRevision: String(entityVersion),
			intentRevision: String(snapshot.intentRevision),
			digest: snapshot.digest,
		},
		project,
	};
}

function nextIntentRevision(document: StoredProductionDocument): string {
	return String(Number.parseInt(document.currentIntentRevision, 10) + 1);
}

function hasProjectValueFields(document: StoredProductionDocument): boolean {
	const metadata = document.metadata;
	return (
		Boolean(metadata) &&
		Boolean(metadata.id?.length) &&
		Boolean(metadata.name?.length) &&
		Boolean(metadata.createdAt?.length) &&
		Boolean(metadata.updatedAt?.length) &&
		Array.isArray(document.scenes) &&
		document.currentSceneId !== undefined &&
		document.currentSceneId !== null &&
		document.settings !== undefined &&
		document.settings !== null &&
		Number.isFinite(document.version)
	);
}

function withProjectValueFields(
	document: StoredProductionDocument,
	project: SerializedProject,
): StoredProductionDocument {
	return { ...document, ...cloneProject(project) };
}

function migrateProject(project: SerializedProject): SerializedProject {
	if (project.version === 32) return project;
	const result = transformProjectV31ToV32({ project });
	if (result.skipped) {
		throw new Error(
			`Edit ${project.metadata?.id ?? "unknown"} has unsupported schema version`,
		);
	}
	return result.project;
}

export class ProductionDocumentService {
	private readonly projects: SdkAdapter<SerializedProject | StoredDocumentWire>;
	private readonly filesApi: FilesStorageApi;

	constructor(sdk: ProductionDocumentSdk = { entities, files }) {
		this.projects = new SdkAdapter({
			entityType: PROJECT_ENTITY_TYPE,
			entityApi: sdk.entities,
		});
		this.filesApi = sdk.files;
	}

	private async readRecord(editId: string) {
		const record = await this.projects.readRecord(editId);
		if (!record) return null;
		const value = decodeDocument(record.data.value);
		rememberProjectName({ editId, name: value.metadata?.name });
		return { ...record, data: { ...record.data, value } };
	}

	private createRecord({
		key,
		value,
		id,
		idempotencyKey,
	}: {
		key: string;
		value: StoredProductionDocument;
		id: string;
		idempotencyKey: string;
	}) {
		return this.projects.createRecord({ key, value: encodeDocument(toLosslessJson(value)), id, idempotencyKey });
	}

	private compareAndSet({
		key,
		value,
		entityId,
		expectedVersion,
		idempotencyKey,
	}: {
		key: string;
		value: StoredProductionDocument;
		entityId: string;
		expectedVersion: number;
		idempotencyKey: string;
	}) {
		return this.projects.compareAndSet({ key, value: encodeDocument(toLosslessJson(value)), entityId, expectedVersion, idempotencyKey });
	}

	async load(editId: string): Promise<LoadedProductionDocument | null> {
		const record = await this.readRecord(editId);
		if (!record) return null;
		if (isStoredDocument(record.data.value)) {
			const document = record.data.value;
			const thumbnail = document.derived?.thumbnail ?? document.metadata?.thumbnail;
			const timelineViewState = document.derived?.timelineViewState ?? document.timelineViewState;
			const compacted = await compactDocument(document);
			const repaired = hasProjectValueFields(compacted)
				? compacted
				: withProjectValueFields(compacted, currentSnapshot(compacted).project);
			const repairedWithDerived = withDerivedData(repaired, { thumbnail, timelineViewState });
			if (JSON.stringify(repairedWithDerived) !== JSON.stringify(document)) {
				try {
					const updated = await this.compareAndSet({
						key: editId,
						value: repairedWithDerived,
						entityId: record.id,
						expectedVersion: record.version,
						idempotencyKey: `edit:${editId}:repair:${record.version}`,
					});
					return loadedDocument({
						document: repairedWithDerived,
						entityVersion: updated.version,
						thumbnail,
						timelineViewState,
					});
				} catch (error) {
					if (!(error instanceof Error)) throw error;
					return this.resolveWriteFailure({
						editId,
						expectedRevision: null,
						digest: currentSnapshot(document).digest,
						error,
					});
				}
			}
			return loadedDocument({
				document: repairedWithDerived,
				entityVersion: record.version,
				thumbnail,
				timelineViewState,
			});
		}
		return this.migrateLegacy({
			editId,
			entityId: record.id,
			entityVersion: record.version,
			project: record.data.value,
		});
	}

	async readCurrent(editId: string): Promise<ProductionDocumentCurrentRead | null> {
		const record = await this.readRecord(editId);
		if (!record) return null;
		if (isStoredDocument(record.data.value)) {
			return {
				kind: "document",
				document: loadedDocument({
					document: record.data.value,
					entityVersion: record.version,
					thumbnail:
						record.data.value.derived?.thumbnail ?? record.data.value.metadata.thumbnail,
					timelineViewState:
						record.data.value.derived?.timelineViewState ?? record.data.value.timelineViewState,
				}),
			};
		}
		return {
			kind: "legacy",
			editId,
			storageCasRevision: String(record.version),
			project: cloneProject(record.data.value),
		};
	}

	async listEdits(): Promise<ProductionEditListing> {
		const records = await this.projects.listRecords();
		const candidates = records.map((record) => {
			const value = decodeDocument(record.data.value);
			const metadata = value.metadata;
			const revision = isStoredDocument(value)
				? loadedDocument({
					document: value,
					entityVersion: record.version,
					thumbnail: value.derived?.thumbnail ?? value.metadata.thumbnail,
					timelineViewState: value.derived?.timelineViewState ?? value.timelineViewState,
				}).revision
				: undefined;
			return {
				editId: record.data.storageKey,
				name: metadata.name,
				updatedAt: metadata.updatedAt,
				revision,
				legacyStorageCasRevision: revision ? undefined : String(record.version),
			};
		});
		candidates.sort((left, right) => {
			const updatedDifference = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
			if (Number.isFinite(updatedDifference) && updatedDifference !== 0) return updatedDifference;
			return right.editId.localeCompare(left.editId);
		});

		const persistedActive = readPersistedActiveEditId();
		const persistedCandidate = persistedActive.editId
			? candidates.find((candidate) => candidate.editId === persistedActive.editId)
			: undefined;
		const current = persistedCandidate ?? candidates[0];
		const currentIndex = current ? candidates.indexOf(current) : -1;
		const edits = candidates.slice(0, MAX_EDIT_LIST_SIZE).map((candidate, index) => ({
			editId: candidate.editId,
			name: candidate.name,
			updatedAt: candidate.updatedAt,
			active: index === currentIndex,
		}));
		if (current && currentIndex >= MAX_EDIT_LIST_SIZE) {
			edits[MAX_EDIT_LIST_SIZE - 1] = {
				editId: current.editId,
				name: current.name,
				updatedAt: current.updatedAt,
				active: true,
			};
		}
		return {
			edits,
			...(current ? {
				activeEditId: current.editId,
				...(current.revision ? { activeRevision: current.revision } : { activeLegacyStorageCasRevision: current.legacyStorageCasRevision }),
			} : {}),
			activeEditSource: persistedCandidate ? "storage" : "most-recent",
		};
	}

	async admitLegacy({
		editId,
		expectedStorageCasRevision,
	}: {
		editId: string;
		expectedStorageCasRevision: string;
	}): Promise<LoadedProductionDocument> {
		const expectedVersion = Number(expectedStorageCasRevision);
		if (
			!Number.isSafeInteger(expectedVersion) ||
			expectedVersion < 1 ||
			String(expectedVersion) !== expectedStorageCasRevision
		) {
			throw new Error("The legacy storage revision is not supported");
		}
		const record = await this.readRecord(editId);
		if (!record) throw new Error(`Edit ${editId} no longer exists`);
		if (isStoredDocument(record.data.value)) {
			const document = record.data.value;
			const loaded = loadedDocument({
				document,
				entityVersion: record.version,
				thumbnail: document.derived?.thumbnail ?? document.metadata.thumbnail,
				timelineViewState: document.derived?.timelineViewState ?? document.timelineViewState,
			});
			if (
				document.editId === editId &&
				record.version === expectedVersion + 1 &&
				document.currentIntentRevision === "1" &&
				document.snapshots.length === 1 &&
				document.snapshots[0]?.intentRevision === "1"
			) {
				return loaded;
			}
			throw new EditRevisionConflictError({
				editId,
				expected: null,
				actual: loaded.revision,
			});
		}
		if (record.version !== expectedVersion) {
			throw new LegacyEditRevisionConflictError({
				editId,
				expectedStorageCasRevision,
				actualStorageCasRevision: String(record.version),
			});
		}
		return this.migrateLegacy({
			editId,
			entityId: record.id,
			entityVersion: record.version,
			project: record.data.value,
		});
	}

	async save({
		editId,
		project,
		expectedRevision,
		intent = "user",
	}: {
		editId: string;
		project: SerializedProject;
		expectedRevision: EditRevision | null;
		intent?: "user" | "derived";
	}): Promise<LoadedProductionDocument> {
		const nextProject = migrateProject(cloneProject(project));
		const revision = revisionProject(nextProject);
		const digest = await digestProject(revision);
		const current = await this.readRecord(editId);
		if (!current) {
			if (expectedRevision !== null) {
				throw new Error(`Edit ${editId} no longer exists`);
			}
			return this.create({ editId, project: nextProject, digest });
		}
		const loaded = isStoredDocument(current.data.value)
			? loadedDocument({
					document: current.data.value,
					entityVersion: current.version,
					thumbnail: nextProject.metadata.thumbnail,
					timelineViewState: nextProject.timelineViewState,
				})
			: await this.migrateLegacy({
					editId,
					entityId: current.id,
					entityVersion: current.version,
					project: current.data.value,
				});
		if (intent === "derived" && isStoredDocument(current.data.value)) {
			const nextDocument = await compactDocument(
				withDerivedData(current.data.value, {
					thumbnail: nextProject.metadata.thumbnail,
					timelineViewState: nextProject.timelineViewState,
				}),
			);
			if (JSON.stringify(nextDocument) === JSON.stringify(current.data.value)) {
				return loaded;
			}
			try {
				const updated = await this.compareAndSet({
					key: editId,
					value: nextDocument,
					entityId: current.id,
					expectedVersion: current.version,
					idempotencyKey: `derived:${editId}:${current.version}`,
				});
				return loadedDocument({
					document: nextDocument,
					entityVersion: updated.version,
					thumbnail: nextProject.metadata.thumbnail,
					timelineViewState: nextProject.timelineViewState,
				});
			} catch (error) {
				if (!(error instanceof Error)) throw error;
				return this.resolveWriteFailure({
					editId,
					expectedRevision,
					digest: loaded.revision.digest,
					error,
				});
			}
		}
		if (loaded.revision.digest === digest) return loaded;
		if (intent === "derived" && hasSameIntent(loaded.project, nextProject)) {
			return loaded;
		}
		if (
			!expectedRevision ||
			expectedRevision.editId !== editId ||
			expectedRevision.intentRevision !== loaded.revision.intentRevision ||
			expectedRevision.digest !== loaded.revision.digest
		) {
			throw new EditRevisionConflictError({
				editId,
				expected: expectedRevision,
				actual: loaded.revision,
			});
		}
		const document = current.data.value;
		if (!isStoredDocument(document)) {
			throw new Error(`Edit ${editId} migration did not settle`);
		}
		const intentRevision = nextIntentRevision(document);
		const candidateDocument: StoredProductionDocument = {
			...document,
			...revision,
			currentIntentRevision: intentRevision,
			snapshots: [
				...document.snapshots,
				{ intentRevision, digest, project: revision },
			],
		};
		const nextDocument = await compactDocument(
			withDerivedData(candidateDocument, {
				thumbnail: nextProject.metadata.thumbnail,
				timelineViewState: nextProject.timelineViewState,
			}),
		);
		try {
			const updated = await this.compareAndSet({
				key: editId,
				value: nextDocument,
				entityId: current.id,
				expectedVersion: current.version,
				idempotencyKey: `edit:${editId}:${intentRevision}:${digest}`,
			});
			return loadedDocument({
				document: nextDocument,
				entityVersion: updated.version,
				thumbnail: nextProject.metadata.thumbnail,
				timelineViewState: nextProject.timelineViewState,
			});
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.resolveWriteFailure({ editId, expectedRevision, digest, error });
		}
	}

	async readRevision({
		editId,
		intentRevision,
	}: {
		editId: string;
		intentRevision: string;
	}): Promise<LoadedProductionDocument | null> {
		const record = await this.readRecord(editId);
		if (!record || !isStoredDocument(record.data.value)) return null;
		const snapshot = record.data.value.snapshots.find(
			(candidate) => String(candidate.intentRevision) === String(intentRevision),
		);
		if (!snapshot) return null;
		return {
			revision: {
				editId,
				storageCasRevision: String(record.version),
				intentRevision,
				digest: snapshot.digest,
			},
			project: revisionProject(snapshot.project),
		};
	}

	async publishRevision({
		editId,
		intentRevision,
	}: {
		editId: string;
		intentRevision: string;
	}): Promise<PublishedEditRevision | null> {
		const loaded = await this.readRevision({ editId, intentRevision });
		if (!loaded) return null;
		const content = JSON.stringify({
			revision: loaded.revision,
			project: loaded.project,
		});
		rememberProjectName({ editId, name: loaded.project.metadata?.name });
		const published = await this.filesApi.publish({
			content,
			name: `${editId}-revision-${intentRevision}.json`,
			mimeType: "application/json",
			folder: await resolveProjectFolder({ editId, section: "Revisions" }),
		});
		return { revision: loaded.revision, ...published };
	}

	subscribe(
		editId: string,
		onRevision: (value: LoadedProductionDocument) => void,
		onError: (error: Error) => void = (error) =>
			console.error("Failed to refresh edit document:", error),
	) {
		return this.projects.subscribe(editId, () => {
			void this.load(editId).then((loaded) => {
				if (loaded) onRevision(loaded);
			}, onError);
		});
	}

	async list(): Promise<string[]> {
		return this.projects.list();
	}

	/** Display metadata for every edit, in one query. Callers that only need the
	 * project chooser's rows must not hydrate each document. */
	async listEditMetadata(): Promise<
		Array<{ editId: string; metadata: SerializedProject['metadata'] }>
	> {
		const entries = await this.projects.listEntries();
		const result: Array<{ editId: string; metadata: SerializedProject['metadata'] }> = [];
		for (const entry of entries) {
			const metadata = entry.value?.metadata;
			if (
				!metadata ||
				typeof metadata.id !== "string" ||
				metadata.id.length === 0 ||
				typeof metadata.name !== "string" ||
				typeof metadata.createdAt !== "string" ||
				typeof metadata.updatedAt !== "string"
			) continue;
			rememberProjectName({ editId: entry.key, name: metadata.name });
			result.push({ editId: entry.key, metadata });
		}
		return result;
	}

	async remove(editId: string): Promise<void> {
		await this.projects.remove(editId);
	}

	async clear(): Promise<void> {
		await this.projects.clear();
	}

	private async create({
		editId,
		project,
		digest,
	}: {
		editId: string;
		project: SerializedProject;
		digest: string;
	}): Promise<LoadedProductionDocument> {
		const revision = revisionProject(project);
		const document: StoredProductionDocument = {
			...revision,
			...(project.metadata.thumbnail === undefined && project.timelineViewState === undefined
				? {}
				: { derived: {
					...(project.metadata.thumbnail === undefined ? {} : { thumbnail: project.metadata.thumbnail }),
					...(project.timelineViewState === undefined ? {} : { timelineViewState: structuredClone(project.timelineViewState) }),
				} }),
			kind: "opencut.production-document",
			formatVersion: 1,
			editId,
			currentIntentRevision: "1",
			snapshots: [{ intentRevision: "1", digest, project: revision }],
		};
		try {
			const record = await this.createRecord({
				key: editId,
				value: document,
				id: editId,
				idempotencyKey: `edit:${editId}:create:${digest}`,
			});
			return loadedDocument({
				document,
				entityVersion: record.version,
				thumbnail: project.metadata.thumbnail,
				timelineViewState: project.timelineViewState,
			});
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.resolveWriteFailure({
				editId,
				expectedRevision: null,
				digest,
				error,
			});
		}
	}

	private async migrateLegacy({
		editId,
		entityId,
		entityVersion,
		project,
	}: {
		editId: string;
		entityId: string;
		entityVersion: number;
		project: SerializedProject;
	}): Promise<LoadedProductionDocument> {
		const migrated = migrateProject(cloneProject(project));
		const revision = revisionProject(migrated);
		const digest = await digestProject(revision);
		const document: StoredProductionDocument = {
			...revision,
			...(migrated.metadata.thumbnail === undefined && migrated.timelineViewState === undefined
				? {}
				: { derived: {
					...(migrated.metadata.thumbnail === undefined ? {} : { thumbnail: migrated.metadata.thumbnail }),
					...(migrated.timelineViewState === undefined ? {} : { timelineViewState: structuredClone(migrated.timelineViewState) }),
				} }),
			kind: "opencut.production-document",
			formatVersion: 1,
			editId,
			currentIntentRevision: "1",
			snapshots: [{ intentRevision: "1", digest, project: revision }],
		};
		try {
			const updated = await this.compareAndSet({
				key: editId,
				value: document,
				entityId,
				expectedVersion: entityVersion,
				idempotencyKey: `edit:${editId}:migrate:${digest}`,
			});
			return loadedDocument({
				document,
				entityVersion: updated.version,
				thumbnail: migrated.metadata.thumbnail,
				timelineViewState: migrated.timelineViewState,
			});
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.resolveWriteFailure({
				editId,
				expectedRevision: null,
				digest,
				error,
			});
		}
	}

	private async resolveWriteFailure({
		editId,
		expectedRevision,
		digest,
		error,
	}: {
		editId: string;
		expectedRevision: EditRevision | null;
		digest: string;
		error: Error;
	}): Promise<LoadedProductionDocument> {
		const record = await this.readRecord(editId);
		const actual =
			record && isStoredDocument(record.data.value)
				? loadedDocument({
						document: record.data.value,
						entityVersion: record.version,
						timelineViewState: record.data.value.derived?.timelineViewState ?? record.data.value.timelineViewState,
					})
				: null;
		if (actual?.revision.digest === digest) return actual;
		if (
			actual &&
			(error instanceof ProjectRpcError &&
				error.code === "entity-version-conflict")
		) {
			throw new EditRevisionConflictError({
				editId,
				expected: expectedRevision,
				actual: actual.revision,
			});
		}
		if (actual && expectedRevision === null) {
			throw new EditRevisionConflictError({
				editId,
				expected: expectedRevision,
				actual: actual.revision,
			});
		}
		throw error;
	}
}
