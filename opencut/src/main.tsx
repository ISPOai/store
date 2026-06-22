import "./index.css";
import { createRoot } from "react-dom/client";
import { connectToHost } from "@ispo/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import Editor from "./app/editor/[project_id]/page";

// OpenCut as a ISPO project. The original Next app had a /projects picker
// that routed into /editor/<id>; inside a single ISPO iframe there's no
// multi-route surface, so we mount the editor directly. The `useParams` stub
// in src/lib/next-stubs/navigation.tsx returns `project_id: "default"`, so
// every launch opens the same internal OpenCut project — a stable target
// for the smoke test until an internal project picker lands.

connectToHost();

const rootEl = document.getElementById("root");
if (rootEl) {
	createRoot(rootEl).render(
		<TooltipProvider>
			<Toaster />
			<Editor />
		</TooltipProvider>,
	);
}
