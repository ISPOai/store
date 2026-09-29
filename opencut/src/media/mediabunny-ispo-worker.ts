// Mediabunny 1.45 creates its transparent-video alpha merger from a blob: URL.
// ISPO intentionally permits only same-origin workers, so redirect that private
// CPU path to the checked-in worker under public/ without widening host CSP.
import { ColorAlphaMerger } from "../../node_modules/mediabunny/dist/modules/src/media-sink.js";

type PendingFrame = {
	resolve: (frame: VideoFrame) => void;
	reject: (error: Error) => void;
};

type ColorAlphaMergerInternals = {
	worker: Worker | null;
	pendingRequests: Map<number, PendingFrame>;
	nextRequestId: number;
	updateCpu: (color: VideoFrame, alpha: VideoFrame) => Promise<VideoFrame>;
};

type AlphaMergeWorkerResponse =
	| { id: number; frame: VideoFrame }
	| { id: number; error: string };

const patchedMarker = Symbol.for("opencut.mediabunny.same-origin-alpha-worker");
const prototype = ColorAlphaMerger.prototype as unknown as ColorAlphaMergerInternals & {
	[patchedMarker]?: boolean;
};

if (!prototype[patchedMarker]) {
	const workerAssetName = "mediabunny-color-alpha-merge-worker.js";

	prototype.updateCpu = function updateCpu(
		this: ColorAlphaMergerInternals,
		color: VideoFrame,
		alpha: VideoFrame,
	): Promise<VideoFrame> {
		if (!this.worker) {
			// import.meta.url is the same-origin main bundle URL after ISPO builds the
			// project. Keeping the asset name in a variable prevents a bundler from
			// treating this checked-in public file as an import dependency.
			const workerUrl = new URL(workerAssetName, import.meta.url);
			this.worker = new Worker(workerUrl, {
				name: "mediabunny-color-alpha-merge",
			});

			this.worker.addEventListener(
				"message",
				(event: MessageEvent<AlphaMergeWorkerResponse>) => {
					const data = event.data;
					const pending = this.pendingRequests.get(data.id);
					if (!pending) return;

					this.pendingRequests.delete(data.id);
					if ("error" in data) {
						pending.reject(new Error(data.error));
					} else {
						pending.resolve(data.frame);
					}
				},
			);

			this.worker.addEventListener("error", (event) => {
				const error = new Error(
					event.message || "Same-origin color/alpha merge worker error.",
				);
				for (const pending of this.pendingRequests.values()) {
					pending.reject(error);
				}
				this.pendingRequests.clear();
				this.worker?.terminate();
				this.worker = null;
			});
		}

		const id = this.nextRequestId++;
		const promise = new Promise<VideoFrame>((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
		});

		this.worker.postMessage({ id, color, alpha }, { transfer: [color, alpha] });
		return promise;
	};

	Object.defineProperty(prototype, patchedMarker, {
		value: true,
		configurable: false,
		enumerable: false,
		writable: false,
	});
}
