import type { EditorCore } from "@/core";
import { useEditorStore } from "@/editor/editor-store";
import {
	EditRevisionConflictError,
	isEditRevisionNewer,
	type DocumentSaveStatus,
	type EditRevision,
} from "@/project/production-types";

type SaveManagerOptions = {
	debounceMs?: number;
};

interface AcceptedBoundary {
	dirtyEpoch: number;
	operationOrder: number;
	projectLifetime: number;
}

interface SaveCheckpoint {
	acceptedBoundary: AcceptedBoundary;
	dirtyEpoch: number;
	operationOrder: number;
	projectLifetime: number;
}

export class SaveManager {
	private debounceMs: number;
	private isPaused = false;
	private hasPendingSave = false;
	private dirtyEpoch = 0;
	private operationOrder = 0;
	private projectLifetime = 0;
	private acceptedBoundary: AcceptedBoundary = {
		dirtyEpoch: 0,
		operationOrder: 0,
		projectLifetime: 0,
	};
	private activeSave: Promise<void> | null = null;
	private activeSaveCheckpoint: SaveCheckpoint | null = null;
	private revision: EditRevision | null = null;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private unsubscribeHandlers: Array<() => void> = [];

	constructor({
		editor,
		debounceMs = 800,
	}: {
		editor: EditorCore;
	} & SaveManagerOptions) {
		this.editor = editor;
		this.debounceMs = debounceMs;
	}

	private editor: EditorCore;

	start(): void {
		if (this.unsubscribeHandlers.length > 0) return;
		this.unsubscribeHandlers = [
			this.editor.scenes.subscribe(() => this.markDirty()),
			this.editor.timeline.subscribe(() => this.markDirty()),
		];
	}

	stop(): void {
		for (const unsubscribe of this.unsubscribeHandlers) unsubscribe();
		this.unsubscribeHandlers = [];
		this.clearTimer();
	}

	pause(): void {
		this.isPaused = true;
	}

	resume(): void {
		this.isPaused = false;
		if (this.hasPendingSave) this.queueSave();
	}

	resetForProject(revision: EditRevision | null): void {
		this.projectLifetime += 1;
		this.revision = revision;
		this.hasPendingSave = false;
		this.dirtyEpoch += 1;
		this.operationOrder = 0;
		this.acceptedBoundary = {
			dirtyEpoch: this.dirtyEpoch,
			operationOrder: 0,
			projectLifetime: this.projectLifetime,
		};
		this.clearTimer();
		this.setStatus({ kind: "clean", revision });
	}

	beginOperation(): SaveCheckpoint {
		this.operationOrder += 1;
		return this.captureCheckpoint();
	}

	private captureCheckpoint(): SaveCheckpoint {
		return {
			acceptedBoundary: this.acceptedBoundary,
			dirtyEpoch: this.dirtyEpoch,
			operationOrder: this.operationOrder,
			projectLifetime: this.projectLifetime,
		};
	}

	acknowledgeRevision({
		checkpoint,
		revision,
	}: {
		checkpoint: SaveCheckpoint;
		revision: EditRevision;
	}): boolean {
		if (checkpoint.projectLifetime !== this.projectLifetime) return false;
		if (isEditRevisionNewer(revision, this.revision)) this.revision = revision;
		this.acceptedBoundary.dirtyEpoch = Math.max(
			this.acceptedBoundary.dirtyEpoch,
			checkpoint.dirtyEpoch,
		);
		this.acceptedBoundary.operationOrder = Math.max(
			this.acceptedBoundary.operationOrder,
			checkpoint.operationOrder,
		);
		if (this.acceptedBoundary.dirtyEpoch >= this.dirtyEpoch) {
			this.hasPendingSave = false;
			this.clearTimer();
			this.setStatus({ kind: "clean", revision: this.revision });
		} else {
			this.hasPendingSave = true;
			this.setStatus({ kind: "dirty", revision: this.revision });
			this.queueSave();
		}
		return true;
	}

	markDirty({ force = false }: { force?: boolean } = {}): void {
		if (this.isPaused && !force) return;
		this.dirtyEpoch += 1;
		this.hasPendingSave = true;
		const status = useEditorStore.getState().documentSaveStatus;
		if (status.kind !== "conflict") {
			this.setStatus({ kind: "dirty", revision: this.revision });
			this.queueSave();
		}
	}

	reportConflict(actual: EditRevision, checkpoint: SaveCheckpoint | null = null): void {
		if (checkpoint && (!this.isCurrentLifetime(checkpoint) ||
			this.isOperationSuperseded(checkpoint))) return;
		this.hasPendingSave = true;
		this.clearTimer();
		this.setStatus({
			kind: "conflict",
			expected: this.revision,
			actual,
		});
	}

	async flush(): Promise<void> {
		this.markDirty({ force: true });
		const target = this.captureCheckpoint();
		for (;;) {
			const saving = this.saveNow();
			const attempted = this.activeSaveCheckpoint;
			try {
				await saving;
			} catch (error) {
				if (
					attempted?.projectLifetime === target.projectLifetime &&
					attempted.dirtyEpoch >= target.dirtyEpoch
				) throw error;
				if (this.isDraftAccepted(target)) return;
				if (this.projectLifetime !== target.projectLifetime) {
					throw new Error("Project changed before the requested draft was saved");
				}
				if (!this.hasPendingSave) {
					throw new Error("Unable to persist the requested project draft");
				}
				continue;
			}
			if (
				attempted?.projectLifetime === target.projectLifetime &&
				attempted.dirtyEpoch >= target.dirtyEpoch
			) return;
			if (this.isDraftAccepted(target)) return;
			if (this.projectLifetime !== target.projectLifetime) {
				throw new Error("Project changed before the requested draft was saved");
			}
			if (!attempted || !this.hasPendingSave) {
				throw new Error("Unable to persist the requested project draft");
			}
		}
	}

	getIsDirty(): boolean {
		return this.hasPendingSave || this.activeSave !== null;
	}

	getIsSaving(): boolean {
		return this.activeSave !== null;
	}

	private queueSave(): void {
		if (this.activeSave) return;
		this.clearTimer();
		this.saveTimer = setTimeout(() => {
			void this.saveNow().catch(() => undefined);
		}, this.debounceMs);
	}

	private async saveNow(): Promise<void> {
		if (this.activeSave) return this.activeSave;
		if (!this.hasPendingSave) return;
		const activeProject = this.editor.project.getActiveOrNull();
		if (!activeProject) return;
		if (this.editor.project.getIsLoading()) return;
		if (this.editor.project.getMigrationState().isMigrating) return;

		const checkpoint = this.beginOperation();
		const savedEditId = activeProject.metadata.id;
		this.clearTimer();
		this.setStatus({ kind: "saving", revision: this.revision });
		this.activeSaveCheckpoint = checkpoint;
		const operation = (async () => {
			try {
				const revision = await this.editor.project.saveCurrentProject();
				if (
					!this.isCurrentLifetime(checkpoint) ||
					this.editor.project.getActiveOrNull()?.metadata.id !== savedEditId
				) {
					return;
				}
				if (revision) this.acknowledgeRevision({ checkpoint, revision });
			} catch (error) {
				if (
					!this.isCurrentLifetime(checkpoint) ||
					this.isOperationSuperseded(checkpoint)
				) throw error;
				this.hasPendingSave = true;
				if (error instanceof EditRevisionConflictError) {
					this.setStatus({
						kind: "conflict",
						expected: error.expected,
						actual: error.actual,
					});
				} else {
					this.setStatus({
						kind: "failed",
						revision: this.revision,
						message: error instanceof Error ? error.message : "Save failed",
					});
				}
				throw error;
			}
		})();
		const settled = operation.finally(() => {
			if (this.activeSave !== settled) return;
			this.activeSave = null;
			this.activeSaveCheckpoint = null;
			this.editor.project.reconcileExternalRevision();
			const status = useEditorStore.getState().documentSaveStatus;
			if (this.hasPendingSave && status.kind === "dirty") this.queueSave();
		});
		this.activeSave = settled;
		await settled;
	}

	private setStatus(status: DocumentSaveStatus): void {
		useEditorStore.getState().setDocumentSaveStatus(status);
	}

	private isCurrentLifetime(checkpoint: SaveCheckpoint): boolean {
		return checkpoint.projectLifetime === this.projectLifetime;
	}

	private isDraftAccepted(checkpoint: SaveCheckpoint): boolean {
		return checkpoint.acceptedBoundary.projectLifetime ===
			checkpoint.projectLifetime &&
			checkpoint.acceptedBoundary.dirtyEpoch >= checkpoint.dirtyEpoch;
	}

	private isOperationSuperseded(checkpoint: SaveCheckpoint): boolean {
		return this.isCurrentLifetime(checkpoint) &&
			checkpoint.acceptedBoundary.operationOrder > checkpoint.operationOrder;
	}

	private clearTimer(): void {
		if (!this.saveTimer) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = null;
	}
}
