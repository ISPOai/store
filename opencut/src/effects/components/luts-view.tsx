"use client";

import { useEffect, useRef, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { files, type PowerboxPickResult } from "@ispo/sdk";
import { effectPreviewService } from "@/services/renderer/effect-preview";
import { lutRegistry } from "@/effects/lut/registry";
import { useLutStore } from "@/effects/lut/lut-store";
import { Delete01Icon, FolderUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const LUT_EFFECT_TYPE = "lut";

export function LutsView() {
	const { userLuts, loadUserLuts, importLut, removeLut } = useLutStore();
	const [isImporting, setIsImporting] = useState(false);

	useEffect(() => {
		loadUserLuts();
	}, [loadUserLuts]);

	const pickResultToCube = async (
		result: PowerboxPickResult,
	): Promise<{ name: string; cube: string } | null> => {
		try {
			if (!result.url) throw new Error("Files did not provide a controlled reference");
			const response = await fetch(result.url);
			if (!response.ok) throw new Error(`Files returned ${response.status}`);
			const text = await response.text();
			return { name: result.name, cube: text };
		} catch (error) {
			console.error("Failed to load picked LUT:", result.name, error);
			return null;
		}
	};

	const handleImport = async () => {
		try {
			const picked = await files.pick({ accept: [".cube"], multiple: true });
			if (!picked) return;
			const results = Array.isArray(picked) ? picked : [picked];
			setIsImporting(true);
			const loaded = (
				await Promise.all(results.map(pickResultToCube))
			).filter((item): item is { name: string; cube: string } => item !== null);

			let imported = 0;
			for (const { name, cube } of loaded) {
				const saved = await importLut({ name, cube });
				if (saved) imported += 1;
			}
			if (imported > 0) {
				toast.success(`Imported ${imported} LUT${imported === 1 ? "" : "s"}`);
			}
		} catch (error) {
			console.error("Import LUT from Files failed:", error);
			toast.error("Import failed");
		} finally {
			setIsImporting(false);
		}
	};

	const luts = lutRegistry.list();

	return (
		<PanelView
			title="LUTs"
			actions={
				<Button
					variant="outline"
					size="sm"
					disabled={isImporting}
					onClick={handleImport}
				>
					<HugeiconsIcon icon={FolderUploadIcon} className="size-4" />
					Import .cube
				</Button>
			}
		>
			<LutsGrid luts={luts} userLutIds={new Set(userLuts.map((lut) => lut.id))} onRemove={removeLut} />
		</PanelView>
	);
}

function LutsGrid({
	luts,
	userLutIds,
	onRemove,
}: {
	luts: Array<{ id: string; name: string; source: "bundled" | "user" }>;
	userLutIds: Set<string>;
	onRemove: ({ id }: { id: string }) => Promise<void>;
}) {
	if (luts.length === 0) {
		return (
			<div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
				No LUTs yet. Import a .cube file to get started.
			</div>
		);
	}

	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{luts.map((lut) => (
				<LutCard
					key={lut.id}
					lutId={lut.id}
					name={lut.name}
					isUserLut={userLutIds.has(lut.id)}
					onRemove={onRemove}
				/>
			))}
		</div>
	);
}

function LutPreviewCanvas({ lutId }: { lutId: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const render = () => {
			if (canvasRef.current) {
				effectPreviewService.renderPreview({
					effectType: LUT_EFFECT_TYPE,
					params: { lutId, strength: 1 },
					targetCanvas: canvasRef.current,
				});
			}
		};

		render();
		return effectPreviewService.onPreviewImageReady({ callback: render });
	}, [lutId]);

	return <canvas ref={canvasRef} className="size-full" />;
}

function LutCard({
	lutId,
	name,
	isUserLut,
	onRemove,
}: {
	lutId: string;
	name: string;
	isUserLut: boolean;
	onRemove: ({ id }: { id: string }) => Promise<void>;
}) {
	const preview = <LutPreviewCanvas lutId={lutId} />;

	return (
		<div className="group relative">
			<div className="flex flex-col overflow-hidden rounded-lg border bg-card">
				<div className="aspect-square w-full">{preview}</div>
				<div className="flex items-center justify-between gap-1 px-2 py-1.5">
					<span className="truncate text-xs font-medium">{name}</span>
					{isUserLut && (
						<Button
							variant="ghost"
							size="icon"
							className="text-muted-foreground hover:text-destructive size-6"
							aria-label={`Remove ${name}`}
							onClick={() => onRemove({ id: lutId })}
						>
							<HugeiconsIcon icon={Delete01Icon} className="size-3.5" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
