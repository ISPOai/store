export interface SavedLut {
	id: string;
	name: string;
	cube: string;
	importedAt: string;
}

export interface SavedLutsData {
	luts: SavedLut[];
	lastModified: string;
}
