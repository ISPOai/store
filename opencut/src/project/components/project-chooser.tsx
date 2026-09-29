import { useEffect, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { navigateToEditorProject } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { storageService } from "@/services/storage/service";
import { runCreateProject } from "@/project/create-project";
import { formatDate } from "@/utils/date";
import type { TProjectMetadata } from "@/project/types";
import { useEditorChromeStore } from "@/components/editor/editor-chrome-store";

export function ProjectChooserDialog() {
	const editor = useEditor();
	const active = useEditor((e) => e.project.getActiveOrNull()?.metadata);
	const open = useEditorChromeStore((s) => s.projectDialogOpen);
	const setOpen = useEditorChromeStore((s) => s.setProjectDialogOpen);
	const [projects, setProjects] = useState<TProjectMetadata[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const operation = useRef(false);

	useEffect(() => {
		if (open) {
			setQuery("");
			setName("");
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		void storageService.loadAllProjectsMetadata().then((saved) => {
			// Most recently edited first: the working set is what the chooser is opened for.
			if (!cancelled) setProjects([...saved].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
		}, (err) => {
			if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load projects.");
		}).finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [open, attempt]);

	async function choose(projectId?: string) {
		if (operation.current) return;
		if (projectId === active?.id) { setOpen(false); return; }
		operation.current = true;
		setBusy(true);
		setError(null);
		try {
			editor.playback.pause();
			if (editor.save.getIsDirty()) await editor.save.flush();
			if (projectId) {
				// Read before navigating so a missing record never creates a replacement edit.
				if (!await storageService.loadProject({ id: projectId })) throw new Error("This project is no longer available. Refresh the list.");
				navigateToEditorProject(projectId);
			} else {
				await runCreateProject({ name: name.trim() });
			}
			setOpen(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to open project.");
		} finally {
			operation.current = false;
			setBusy(false);
		}
	}

	const visible = projects.filter((project) => project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
	return (
		<Dialog open={open} onOpenChange={(value) => { if (!operation.current) setOpen(value); }}>
			<DialogContent className="flex max-h-[80dvh] flex-col gap-2 overflow-hidden p-4 [&>button]:top-4 [&>button]:right-4" data-project-dialog>
				<div className="flex shrink-0 items-center gap-2 pr-7">
					<DialogTitle className="text-sm">Projects</DialogTitle>
					{!loading && <span className="text-xs text-muted-foreground tabular-nums">{visible.length}</span>}
					<DialogDescription className="sr-only">Choose a saved edit or start a new project.</DialogDescription>
				</div>
				<div className="relative shrink-0">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input size="sm" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && visible[0]) { e.preventDefault(); void choose(visible[0].id); } }} placeholder="Search projects" data-project-search />
				</div>
				{error && <div role="alert" className="flex shrink-0 items-center gap-2 text-xs text-destructive"><span className="min-w-0 flex-1">{error}</span><Button variant="ghost" size="sm" className="shrink-0 text-xs" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Refresh</Button></div>}
				<div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1" data-project-list>
					{loading ? <p className="px-2 py-3 text-xs text-muted-foreground">Loading projects…</p> : visible.map((project) => (
						<Button key={project.id} variant={project.id === active?.id ? "secondary" : "ghost"} size="sm" disabled={busy} className="h-8 min-h-8 w-full shrink-0 justify-start gap-2 px-2 font-normal" data-project-id={project.id} onClick={() => void choose(project.id)}>
							<span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDate({ date: project.updatedAt })}</span>
							{project.id === active?.id && <><Check /><span className="sr-only">Current project</span></>}
						</Button>
					))}
					{!loading && !error && visible.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">{query ? "No matching projects." : "No saved projects yet."}</p>}
				</div>
				<form className="flex shrink-0 items-center gap-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); void choose(); }}>
					<Input size="sm" className="flex-1" value={name} maxLength={200} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Untitled Project" aria-label="New project name" data-project-name />
					<Button type="submit" size="sm" className="shrink-0" disabled={busy}><Plus />{busy ? "Opening…" : "New project"}</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
