import "./index.css";
import "@/media/mediabunny-ispo-worker";
import "@/services/project-commands";
import { createRoot } from "react-dom/client";
import { ISPOProvider } from "@ispo/sdk/react";
import { StorageProvider } from "@/components/storage-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import Editor from "./app/editor/[project_id]/page";

// The editor includes a chooser for SDK-backed projects. The route store
// remembers which edit to reopen; project documents live in Entities.

const rootEl = document.getElementById("root");
if (rootEl) {
	createRoot(rootEl).render(
		<ISPOProvider>
			<StorageProvider>
				<TooltipProvider>
					<Toaster />
					<Editor />
				</TooltipProvider>
			</StorageProvider>
		</ISPOProvider>,
	);
}
