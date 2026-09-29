import { beforeEach, describe, expect, test } from "bun:test";
import { SaveManager } from "@/core/managers/save-manager";
import { useEditorStore } from "@/editor/editor-store";
import { EditRevisionConflictError } from "@/project/production-types";

function revision(intentRevision: string, digest = `digest-${intentRevision}`) {
	return {
		editId: "edit-1",
		storageCasRevision: intentRevision,
		intentRevision,
		digest,
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

function testEditor(saveCurrentProject: () => Promise<ReturnType<typeof revision>>) {
	let activeEditId = "edit-1";
	let isLoading = false;
	let reconciliations = 0;
	const editor = {
		project: {
			getActiveOrNull: () => ({ metadata: { id: activeEditId } }),
			getIsLoading: () => isLoading,
			getMigrationState: () => ({ isMigrating: false }),
			saveCurrentProject,
			reconcileExternalRevision: () => {
				reconciliations += 1;
			},
		},
		scenes: { subscribe: () => () => undefined },
		timeline: { subscribe: () => () => undefined },
	};
	return {
		editor,
		getReconciliations: () => reconciliations,
		setLoading: (value: boolean) => {
			isLoading = value;
		},
		switchEdit: (editId: string) => {
			activeEditId = editId;
		},
	};
}

beforeEach(() => {
	useEditorStore.getState().setDocumentSaveStatus({
		kind: "clean",
		revision: null,
	});
});

describe("production autosave", () => {
	test("flush fails explicitly when the requested draft cannot start saving", async () => {
		const fixture = testEditor(() => Promise.resolve(revision("2")));
		const manager = new SaveManager({ editor: fixture.editor, debounceMs: 60_000 });
		manager.resetForProject(revision("1"));
		fixture.setLoading(true);

		await expect(manager.flush()).rejects.toThrow(
			"Unable to persist the requested project draft",
		);
		expect(manager.getIsDirty()).toBe(true);
		manager.stop();
	});

	test("a failed write stays dirty and exposes the failure", async () => {
		const fixture = testEditor(() => Promise.reject(new Error("disk unavailable")));
		const manager = new SaveManager({ editor: fixture.editor, debounceMs: 60_000 });
		manager.resetForProject(revision("1"));

		await expect(manager.flush()).rejects.toThrow("disk unavailable");
		expect(manager.getIsDirty()).toBe(true);
		expect(useEditorStore.getState().documentSaveStatus).toMatchObject({
			kind: "failed",
			message: "disk unavailable",
		});
		expect(fixture.getReconciliations()).toBe(1);
		manager.stop();
	});

	test("a stale external revision becomes a conflict without clearing local work", async () => {
		const expected = revision("1");
		const actual = revision("2", "external");
		const conflict = new EditRevisionConflictError({
			editId: "edit-1",
			expected,
			actual,
		});
		const fixture = testEditor(() => Promise.reject(conflict));
		const manager = new SaveManager({ editor: fixture.editor, debounceMs: 60_000 });
		manager.resetForProject(expected);

		await expect(manager.flush()).rejects.toBe(conflict);
		expect(manager.getIsDirty()).toBe(true);
		expect(useEditorStore.getState().documentSaveStatus).toEqual({
			kind: "conflict",
			expected,
			actual,
		});
		manager.stop();
	});

	test("an edit made during an in-flight save remains pending", async () => {
		const write = deferred<ReturnType<typeof revision>>();
		const fixture = testEditor(() => write.promise);
		const manager = new SaveManager({ editor: fixture.editor, debounceMs: 60_000 });
		manager.resetForProject(revision("1"));
		const flushing = manager.flush();
		await Promise.resolve();

		manager.markDirty();
		write.resolve(revision("2"));
		await flushing;

		expect(manager.getIsDirty()).toBe(true);
		expect(useEditorStore.getState().documentSaveStatus).toEqual({
			kind: "dirty",
			revision: revision("2"),
		});
		manager.stop();
	});

	test("completion for a previous edit cannot overwrite the switched edit state", async () => {
		const write = deferred<ReturnType<typeof revision>>();
		const fixture = testEditor(() => write.promise);
		const manager = new SaveManager({ editor: fixture.editor, debounceMs: 60_000 });
		manager.resetForProject(revision("1"));
		const flushing = manager.flush();
		await Promise.resolve();

		fixture.switchEdit("edit-2");
		const editTwoRevision = {
			...revision("7"),
			editId: "edit-2",
		};
		manager.resetForProject(editTwoRevision);
		write.resolve(revision("2"));
		await flushing;

		expect(manager.getIsDirty()).toBe(false);
		expect(useEditorStore.getState().documentSaveStatus).toEqual({
			kind: "clean",
			revision: editTwoRevision,
		});
		manager.stop();
	});
});
