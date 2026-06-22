declare module "@ispo/sdk" {
	export interface ISPOConnection {
		readonly theme: "dark" | "light" | null;
		disconnect: () => void;
	}

	export const fs: {
		read(path: string): Promise<string>;
		readBinary(path: string): Promise<Uint8Array>;
		write(path: string, content: string): Promise<void>;
		writeBinary(path: string, content: Uint8Array): Promise<void>;
		list(path?: string): Promise<string[]>;
		delete(path: string): Promise<void>;
	};

	export const shared: {
		read(path: string): Promise<string>;
		write(path: string, content: string): Promise<void>;
		list(path?: string): Promise<string[]>;
	};

	export function connectToHost(): ISPOConnection;
}
