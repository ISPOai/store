"use client";

import { shared } from "@ispo/sdk";
import { FilePickerModal } from "@ispo/design/primitives/file-picker";
import "@ispo/design/primitives/modal.css";
import "@ispo/design/primitives/file-picker.css";
import {
	isSharedMediaCandidate,
	readSharedMediaFiles,
	type SharedMediaReadFailure,
} from "@/media/shared-files";

interface SharedFilePickerProps {
	open: boolean;
	disabled?: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesSelected: (files: File[]) => Promise<void> | void;
}

// Thin wrapper over @ispo/design's <FilePickerModal>. The generic dialog —
// directory browsing, selection, the loading/error/empty lifecycle — lives in
// the design package; everything here is OpenCut's media domain: which rows are
// importable (isSharedMediaCandidate), how a selected path becomes a File
// (readSharedMediaFiles, see media/shared-files.ts), and the grant/permission
// copy (describeSharedError). The SDK `shared.list` lister is passed straight
// through because the primitive's `list` prop matches its contract exactly.
export function SharedFilePicker({
	open,
	disabled = false,
	onOpenChange,
	onFilesSelected,
}: SharedFilePickerProps) {
	return (
		<FilePickerModal
			open={open}
			disabled={disabled}
			onClose={() => onOpenChange(false)}
			title="Import from shared files"
			confirmLabel="Import"
			confirmingLabel="Importing…"
			emptyLabel="This shared folder is empty."
			list={(cwd) => shared.list(cwd)}
			isSelectable={isSharedMediaCandidate}
			describeError={describeSharedError}
			onConfirm={async (paths) => {
				const result = await readSharedMediaFiles(paths);
				// Nothing decoded. The rows are filtered by extension, so a selected
				// file that fails to decode (e.g. a raw-binary .mp3/.wav the SDK's
				// text-only shared.read can't reconstruct) needs its REAL reason
				// surfaced — otherwise the user sees "nothing supported" next to a
				// file they just checked. Only fall back to the generic media line
				// when there is no specific failure to report.
				if (result.files.length === 0) {
					return {
						error:
							result.failures.length > 0
								? formatImportFailure(result.failures)
								: "No supported image, video, or audio files were found.",
					};
				}

				await onFilesSelected(result.files);

				// Some files imported, some failed: keep the dialog open showing the
				// partial-import summary. A fully clean import resolves with no error
				// so the primitive clears the selection and closes.
				if (result.failures.length > 0) {
					return { error: formatImportFailure(result.failures) };
				}
				return undefined;
			}}
		/>
	);
}

function formatImportFailure(failures: SharedMediaReadFailure[]): string {
	const first = failures[0];
	const message =
		failures.length === 1
			? first.message
			: `${first.message} (${failures.length} skipped)`;
	return `Could not import ${first.path}: ${message}`;
}

function describeSharedError(error: unknown): string {
	if (error instanceof Error) {
		if (error.message.includes("not-requested")) {
			return "OpenCut needs shared.read in manifest.json before ISPO can show the grant prompt.";
		}
		if (
			error.message.includes("not-granted") ||
			error.message.includes("denied")
		) {
			return "Grant Shared files read in ISPO Settings, then try again.";
		}
		return error.message;
	}

	return "Could not read shared files";
}
