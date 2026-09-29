import type { ProductionDocumentSdk } from "@/project/production-document-service";
import type { ProjectCommandSdk } from "@ispo/sdk";
import { ProductionDocumentService } from "@/project/production-document-service";
import {
	ProductionCommandRouter,
	type ProductionCommandInput,
	type ProductionCommandResult,
} from "./production-command-router";

export interface ProjectCommandRuntime {
	run(input: ProductionCommandInput): Promise<ProductionCommandResult>;
}

export class LegacyProjectCommandUnavailableError extends Error {
	readonly commandId: string;
	readonly reason = "capability-unavailable";

	constructor(commandId: string, message?: string) {
		super(
			message ?? `${commandId} is unavailable in this build; no edit was changed.`,
		);
		this.name = "LegacyProjectCommandUnavailableError";
		this.commandId = commandId;
	}
}

function assertCommandSdk(sdk: ProductionDocumentSdk): void {
	if (!sdk.entities || !sdk.files) {
		throw new Error("The project command SDK storage surface is unavailable");
	}
}

export function createProjectCommandRuntime(
	sdk: ProductionDocumentSdk,
): ProjectCommandRuntime {
	assertCommandSdk(sdk);
	const documents = new ProductionDocumentService(sdk);
	const router = new ProductionCommandRouter(documents);
	return { run: (input) => router.run(input) };
}

export function runProductionCommand(
	input: ProductionCommandInput,
	sdk: ProjectCommandSdk,
	signal?: AbortSignal,
): Promise<ProductionCommandResult> {
	return new ProductionCommandRouter(new ProductionDocumentService(sdk)).run(input, { sdk, signal });
}

export function runUnavailableLegacyProjectCommand(
	commandId: string,
	sdk: ProductionDocumentSdk,
	message?: string,
): Promise<never> {
	assertCommandSdk(sdk);
	return Promise.reject(new LegacyProjectCommandUnavailableError(commandId, message));
}
