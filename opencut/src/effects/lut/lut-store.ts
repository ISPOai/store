import { create } from "zustand";
import { toast } from "sonner";
import { lutRegistry } from "./registry";
import { parseCubeLut } from "./cube";
import type { SavedLut } from "./types";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";

interface LutStore {
	userLuts: SavedLut[];
	isLoaded: boolean;
	isLoading: boolean;
	error: string | null;

	loadUserLuts: () => Promise<void>;
	importLut: ({ name, cube }: { name: string; cube: string }) => Promise<SavedLut | null>;
	removeLut: ({ id }: { id: string }) => Promise<void>;
}

function registerUserLut(lut: SavedLut): void {
	lutRegistry.register({
		id: lut.id,
		name: lut.name,
		source: "user",
		lut: parseCubeLut(lut.cube),
	});
}

export const useLutStore = create<LutStore>((set, get) => ({
	userLuts: [],
	isLoaded: false,
	isLoading: false,
	error: null,

	loadUserLuts: async () => {
		if (get().isLoaded) return;
		try {
			set({ isLoading: true, error: null });
			const data = await storageService.loadLuts();
			for (const lut of data.luts) {
				try {
					registerUserLut(lut);
				} catch (error) {
					console.error(`Skipping invalid LUT "${lut.name}":`, error);
				}
			}
			set({ userLuts: data.luts, isLoaded: true, isLoading: false });
		} catch (error) {
			set({
				error: error instanceof Error ? error.message : "Failed to load LUTs",
				isLoading: false,
			});
			console.error("Failed to load LUTs:", error);
		}
	},

	importLut: async ({ name, cube }) => {
		try {
			parseCubeLut(cube);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Invalid LUT file",
			);
			return null;
		}

		const saved: SavedLut = {
			id: `user-${generateUUID()}`,
			name,
			cube,
			importedAt: new Date().toISOString(),
		};

		try {
			await storageService.saveLut({ lut: saved });
			registerUserLut(saved);
			set((state) => ({ userLuts: [...state.userLuts, saved] }));
			return saved;
		} catch (error) {
			console.error("Failed to save LUT:", error);
			toast.error("Failed to save LUT");
			return null;
		}
	},

	removeLut: async ({ id }) => {
		try {
			await storageService.removeLut({ id });
			lutRegistry.unregister(id);
			set((state) => ({
				userLuts: state.userLuts.filter((lut) => lut.id !== id),
			}));
		} catch (error) {
			console.error("Failed to remove LUT:", error);
			toast.error("Failed to remove LUT");
		}
	},
}));
