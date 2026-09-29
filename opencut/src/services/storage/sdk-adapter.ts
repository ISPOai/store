import {
	entities,
	files,
	type EntityApi,
	type EntityQueryResult,
	type EntityRecord,
	type FilesApi,
	type FilesListEntry,
} from "@ispo/sdk";
import type { StorageAdapter } from "./types";

const ENTITY_PAGE_SIZE = 100;

export interface StoredEntityValue<T> {
	storageKey: string;
	value: T;
}

export type EntityStorageApi = Pick<
	EntityApi,
	"create" | "delete" | "query" | "subscribeQuery" | "update"
>;

export type FilesStorageApi = Pick<FilesApi, "list" | "publish">;

interface StoredFileLink {
	storageKey: string;
	publicId: string;
	name: string;
	mimeType: string;
	size: number;
	lastModified: number;
}

export interface SdkAdapterOptions {
	entityType: string;
	keyPrefix?: string;
	entityApi?: EntityStorageApi;
}

async function queryAllRecords<T>(
	entityApi: EntityStorageApi,
	entityType: string,
): Promise<Array<EntityRecord<T>>> {
	const records: Array<EntityRecord<T>> = [];
	let cursor: string | null = null;

	do {
		const page: EntityQueryResult<T> = await entityApi.query<T>(entityType, {
			limit: ENTITY_PAGE_SIZE,
			cursor,
		});
		records.push(...page.records);
		cursor = page.cursor;
	} while (cursor);

	return records;
}

export class SdkAdapter<T> implements StorageAdapter<T> {
	private readonly entityType: string;
	private readonly keyPrefix: string;
	private readonly entityApi: EntityStorageApi;

	constructor({
		entityType,
		keyPrefix = "",
		entityApi = entities,
	}: SdkAdapterOptions) {
		this.entityType = entityType;
		this.keyPrefix = keyPrefix;
		this.entityApi = entityApi;
	}

	private storageKey(key: string): string {
		return `${this.keyPrefix}${key}`;
	}

	async readRecord(
		key: string,
	): Promise<EntityRecord<StoredEntityValue<T>> | null> {
		const result = await this.entityApi.query<StoredEntityValue<T>>(
			this.entityType,
			{
			where: { storageKey: this.storageKey(key) },
			limit: 1,
			},
		);
		return result.records[0] ?? null;
	}

	async createRecord({
		key,
		value,
		id,
		idempotencyKey,
	}: {
		key: string;
		value: T;
		id: string;
		idempotencyKey: string;
	}): Promise<EntityRecord<StoredEntityValue<T>>> {
		return this.entityApi.create<StoredEntityValue<T>>(
			this.entityType,
			{ storageKey: this.storageKey(key), value },
			{ id, idempotencyKey },
		);
	}

	async compareAndSet({
		key,
		value,
		entityId,
		expectedVersion,
		idempotencyKey,
	}: {
		key: string;
		value: T;
		entityId: string;
		expectedVersion: number;
		idempotencyKey: string;
	}): Promise<EntityRecord<StoredEntityValue<T>>> {
		return this.entityApi.update<StoredEntityValue<T>>(
			this.entityType,
			entityId,
			{ storageKey: this.storageKey(key), value },
			{ expectedVersion, idempotencyKey },
		);
	}

	subscribe(
		key: string,
		onChange: () => void,
	): { close(): void } {
		return this.entityApi.subscribeQuery<StoredEntityValue<T>>(
			this.entityType,
			{ where: { storageKey: this.storageKey(key) }, limit: 1 },
			() => onChange(),
		);
	}

	async set({ key, value }: { key: string; value: T }): Promise<void> {
		const storageKey = this.storageKey(key);
		const current = await this.readRecord(key);
		const data: StoredEntityValue<T> = { storageKey, value };

		if (current) {
			await this.entityApi.update<StoredEntityValue<T>>(
				this.entityType,
				current.id,
				data,
				{ expectedVersion: current.version },
			);
			return;
		}

		await this.entityApi.create<StoredEntityValue<T>>(this.entityType, data);
	}

	async setIfAbsent({ key, value }: { key: string; value: T }): Promise<boolean> {
		if (await this.readRecord(key)) return false;
		await this.set({ key, value });
		return true;
	}

	async get(key: string): Promise<T | null> {
		const record = await this.readRecord(key);
		return record?.data.value ?? null;
	}

	async getAll(): Promise<T[]> {
		const records = await this.listRecords();
		return records
			.filter((record) => record.data.storageKey.startsWith(this.keyPrefix))
			.map((record) => record.data.value);
	}

	async listRecords(): Promise<Array<EntityRecord<StoredEntityValue<T>>>> {
		const records = await queryAllRecords<StoredEntityValue<T>>(
			this.entityApi,
			this.entityType,
		);
		return records.filter((record) =>
			record.data.storageKey.startsWith(this.keyPrefix),
		);
	}

	/** One query for every record this adapter owns, keyed without the prefix.
	 * Bulk callers use this instead of a per-key read round trip. */
	async listEntries(): Promise<Array<{ key: string; value: T; version: number }>> {
		const records = await this.listRecords();
		return records.map((record) => ({
			key: record.data.storageKey.slice(this.keyPrefix.length),
			value: record.data.value,
			version: record.version,
		}));
	}

	async remove(key: string): Promise<void> {
		const current = await this.readRecord(key);
		if (!current) {
			throw new Error(`Entity-backed storage value not found: ${this.storageKey(key)}`);
		}
		await this.entityApi.delete<StoredEntityValue<T>>(this.entityType, current.id);
	}

	async list(): Promise<string[]> {
		const records = await this.listRecords();
		return records
			.map((record) => record.data.storageKey)
			.map((storageKey) => storageKey.slice(this.keyPrefix.length));
	}

	async clear(): Promise<void> {
		const keys = await this.list();
		await Promise.all(keys.map((key) => this.remove(key)));
	}
}

/** A Files folder, either fixed or resolved at publish time (per-edit folders
 * need the edit's display name, which may not be loaded when the adapter is
 * constructed). */
export type FilesFolderRef = string | (() => string | Promise<string>);

export interface SdkBinaryAdapterOptions extends SdkAdapterOptions {
	folder: FilesFolderRef;
	filesApi?: FilesStorageApi;
}

export class SdkBinaryAdapter implements StorageAdapter<File> {
	private readonly links: SdkAdapter<StoredFileLink>;
	private readonly folder: FilesFolderRef;
	private readonly filesApi: FilesStorageApi;

	constructor({
		entityType,
		keyPrefix,
		folder,
		entityApi,
		filesApi = files,
	}: SdkBinaryAdapterOptions) {
		this.links = new SdkAdapter<StoredFileLink>({
			entityType,
			keyPrefix,
			entityApi,
		});
		this.folder = folder;
		this.filesApi = filesApi;
	}

	/** One query for every file link this adapter owns, for bulk hydration. */
	async listLinks(): Promise<Array<{ key: string; link: StoredFileLink }>> {
		const entries = await this.links.listEntries();
		return entries.map(({ key, value }) => ({ key, link: value }));
	}

	/** Every file-link Entity record this adapter owns (with Entity ids), so a
	 * bulk delete can retire them in one `entities.deleteMany` selection. */
	async listRecords(): Promise<Array<EntityRecord<StoredEntityValue<StoredFileLink>>>> {
		return this.links.listRecords();
	}

	/** One Files listing shared by a whole media hydration pass. */
	listPublishedFiles(): Promise<FilesListEntry[]> {
		return this.filesApi.list();
	}

	private sameFile(link: StoredFileLink, file: File): boolean {
		return (
			link.name === file.name &&
			link.mimeType === file.type &&
			link.size === file.size &&
			link.lastModified === file.lastModified
		);
	}

	private async findPublishedFile(
		link: StoredFileLink,
	): Promise<FilesListEntry | null> {
		const ownFiles = await this.filesApi.list();
		return ownFiles.find((entry) => entry.publicId === link.publicId) ?? null;
	}

	async set({ key, value }: { key: string; value: File }): Promise<void> {
		const current = await this.links.get(key);
		if (current && this.sameFile(current, value)) {
			const published = await this.findPublishedFile(current);
			if (published) return;
		}

		const bytes = new Uint8Array(await value.arrayBuffer());
		const folder =
			typeof this.folder === "function" ? await this.folder() : this.folder;
		const published = value.type
			? await this.filesApi.publish({
					content: bytes,
					name: value.name,
					mimeType: value.type,
					folder,
				})
			: await this.filesApi.publish({
					content: bytes,
					name: value.name,
					folder,
				});

		const link: StoredFileLink = {
			storageKey: key,
			publicId: published.publicId,
			name: value.name,
			mimeType: value.type,
			size: value.size,
			lastModified: value.lastModified,
		};
		await this.links.set({ key, value: link });
	}

	async setIfAbsent({ key, value }: { key: string; value: File }): Promise<boolean> {
		const current = await this.links.get(key);
		if (current && (await this.findPublishedFile(current))) return false;
		await this.set({ key, value });
		return true;
	}

	async get(key: string): Promise<File | null> {
		const link = await this.links.get(key);
		if (!link) return null;

		const published = await this.findPublishedFile(link);
		if (!published) return null;

		const response = await fetch(published.url);
		if (!response.ok) {
			throw new Error(`Could not load published media: ${published.name}`);
		}
		const content = await response.blob();
		return new File([content], link.name, {
			type: link.mimeType || content.type,
			lastModified: link.lastModified,
		});
	}

	async remove(key: string): Promise<void> {
		// Removing media from a project retires only OpenCut's Entity reference.
		// The user-meaningful Files artifact remains available in the Files app.
		await this.links.remove(key);
	}

	async list(): Promise<string[]> {
		return this.links.list();
	}

	async clear(): Promise<void> {
		await this.links.clear();
	}
}
