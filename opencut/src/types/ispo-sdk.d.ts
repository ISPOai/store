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

	export interface PowerboxSaveResult {
		path: string;
		publicId?: string;
	}

	// The Files powerbox: the supported way a user artifact leaves this app.
	// The picker itself is the consent surface, so no standing grant is needed.
	// `null` means the user cancelled.
	export const files: {
		save(args: {
			content: string | Uint8Array;
			name?: string;
			accept?: string[];
			timeoutMs?: number;
		}): Promise<PowerboxSaveResult | null>;
	};

	// Code-first project commands. The real SDK infers the handler's input type
	// from the inline `inputSchema`; this local declaration cannot, so handler
	// input is left open here rather than restated as a second, drifting schema.
	export interface ProjectCommandContext {
		sdk: {
			fs: typeof fs;
			shared: typeof shared;
			files: typeof files;
		};
	}

	export const commands: {
		define<TResult>(
			metadata: Record<string, unknown>,
			// biome-ignore lint/suspicious/noExplicitAny: schema-inferred upstream
			handler: (input: any, ctx: ProjectCommandContext) => Promise<TResult>,
			// biome-ignore lint/suspicious/noExplicitAny: schema-inferred upstream
		): { run(input: any): Promise<TResult> };
		expose(commands: unknown[]): { ready(): void };
	};

	export function connectToHost(): ISPOConnection;
}
