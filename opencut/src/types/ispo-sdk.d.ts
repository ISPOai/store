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
		write(path: string, content: string): Promise<{ path: string }>;
		writeBinary(path: string, content: Uint8Array): Promise<{ path: string }>;
		list(path?: string): Promise<string[]>;
	};

	export interface PowerboxPickResult {
		path?: string;
		url?: string;
		name: string;
		mimeType: string;
		size: number;
		kind: "image" | "video" | "audio" | "document" | "data" | "other";
	}

	export interface PowerboxOpenArgs {
		accept?: string[];
		multiple?: boolean;
		timeoutMs?: number;
	}

	export interface PowerboxSaveResult {
		path: string;
		publicId?: string;
	}

	// The Files powerbox: the supported way a user artifact leaves this app.
	// The picker itself is the consent surface, so no standing grant is needed.
	// `null` means the user cancelled.
	export const files: {
		pick(
			args?: PowerboxOpenArgs,
		): Promise<PowerboxPickResult | PowerboxPickResult[] | null>;
		save(args: {
			content: string | Uint8Array;
			name?: string;
			accept?: string[];
			timeoutMs?: number;
		}): Promise<PowerboxSaveResult | null>;
	};

	// Code-first project commands. Call sites provide explicit input/result
	// generics because this lightweight standalone declaration does not reproduce
	// the real SDK's JSON-schema-to-TypeScript inference machinery.
	export interface ProjectCommandContext {
		sdk: {
			fs: typeof fs;
			shared: typeof shared;
			files: typeof files;
		};
	}

	export interface ProjectCommand<TInput, TResult> {
		run(input: TInput): Promise<TResult>;
	}

	export interface ProjectCommandExposure {
		ready(): void;
		dispose(): void;
	}

	export const commands: {
		define<TInput, TResult extends { kind: string }>(
			metadata: Record<string, unknown>,
			handler: (input: TInput, ctx: ProjectCommandContext) => Promise<TResult>,
		): ProjectCommand<TInput, TResult>;
		expose(commands: readonly unknown[]): ProjectCommandExposure;
	};

	export function connectToHost(): ISPOConnection;
}
