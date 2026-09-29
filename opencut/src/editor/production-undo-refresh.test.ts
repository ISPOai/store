import { describe, expect, mock, test } from "bun:test";
import { Command } from "@/commands/base-command";
import { BatchCommand } from "@/commands/batch-command";

mock.module("@/ripple", () => ({
	applyRippleAdjustments: ({ tracks }: { tracks: unknown }) => tracks,
	computeRippleAdjustments: () => [],
}));

const { CommandManager } = await import("@/core/managers/commands");

class CounterCommand extends Command {
	constructor(
		private state: { value: number },
		private delta: number,
	) {
		super();
	}

	execute(): void {
		this.state.value += this.delta;
	}

	undo(): void {
		this.state.value -= this.delta;
	}
}

function testEditor() {
	return {
		scenes: { getActiveSceneOrNull: () => null },
		selection: {
			getSnapshot: () => ({
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			}),
			applySelectionPatch: () => ({
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			}),
			restoreSnapshot: () => undefined,
		},
		timeline: { updateTracks: () => undefined },
	};
}

describe("production undo refresh", () => {
	test("grouped execute, undo, and redo each refresh production state once", () => {
		const state = { value: 0 };
		const manager = new CommandManager(testEditor());
		let refreshes = 0;
		const unsubscribe = manager.registerReactor(() => {
			refreshes += 1;
		});
		const command = new BatchCommand([
			new CounterCommand(state, 2),
			new CounterCommand(state, 3),
		]);

		manager.execute({ command });
		expect(state.value).toBe(5);
		expect(refreshes).toBe(1);

		manager.undo();
		expect(state.value).toBe(0);
		expect(refreshes).toBe(2);

		manager.redo();
		expect(state.value).toBe(5);
		expect(refreshes).toBe(3);

		manager.clear();
		expect(manager.canUndo()).toBe(false);
		expect(manager.canRedo()).toBe(false);
		unsubscribe();
		manager.execute({ command: new CounterCommand(state, 1) });
		expect(refreshes).toBe(3);
	});
});
