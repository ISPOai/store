"use client";

import { useState } from "react";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
	EXPORT_CANCELLED_MESSAGE,
	runExportProject,
} from "@/export/export-command";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_MOV_CODEC_VALUES,
	EXPORT_QUALITY_VALUES,
	isAudioOnlyExportFormat,
	isVideoExportFormat,
	type ExportFormat,
	type ExportMovCodec,
	type ExportQuality,
} from "@/export";
import {
	EXPORT_RESOLUTION_PRESETS,
	resolveExportCanvasSize,
	type ExportResolutionPreset,
} from "@/export/resolution";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { useEditorChromeStore } from "@/components/editor/editor-chrome-store";
import { frameRateToFloat } from "@/fps/utils";

const EXPORT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;
const EXPORT_BITRATE_MBPS_OPTIONS = [8, 12, 16, 24, 50] as const;

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

function isExportMovCodec(value: string): value is ExportMovCodec {
	return EXPORT_MOV_CODEC_VALUES.some((codecValue) => codecValue === value);
}

function isExportResolutionPreset(value: string): value is ExportResolutionPreset {
	return EXPORT_RESOLUTION_PRESETS.some((preset) => preset.id === value);
}

export function ExportPopover() {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const hasProject = !!activeProject;
	const open = useEditorChromeStore((s) => s.exportPopoverOpen);
	const setOpen = useEditorChromeStore((s) => s.setExportPopoverOpen);

	const handleOpenChange = (value: boolean) => {
		if (!value) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setOpen(value);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverAnchor className="fixed top-3 right-3 size-0" />
			{hasProject && <ExportPanel onOpenChange={setOpen} side="bottom" />}
		</Popover>
	);
}

function ExportPanel({
	onOpenChange,
	side = "bottom",
}: {
	onOpenChange: (open: boolean) => void;
	side?: "bottom" | "right" | "top" | "left";
}) {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const { isExporting, progress, result: exportResult } = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const [resolution, setResolution] = useState<ExportResolutionPreset>("source");
	const [fps, setFps] = useState<number | null>(null);
	const [bitrateMbps, setBitrateMbps] = useState<number | null>(null);
	const [movCodec, setMovCodec] = useState<ExportMovCodec>("h264");

	const isVideo = isVideoExportFormat(format);
	const isGif = format === "gif";
	const isAudioOnly = isAudioOnlyExportFormat(format);

	const handleExport = async () => {
		if (!activeProject) return;

		const resolvedResolution =
			resolution === "source"
				? undefined
				: resolveExportCanvasSize({
						canvasSize: activeProject.settings.canvasSize,
						resolution,
					});

		try {
			const result = await runExportProject({
				format,
				quality,
				includeAudio: shouldIncludeAudio,
				resolution: resolvedResolution,
				fps: fps ?? undefined,
				bitrate: bitrateMbps !== null ? bitrateMbps * 1_000_000 : undefined,
				movCodec: format === "mov" ? movCodec : undefined,
			});
			toast.success("Export saved to Files", {
				description: result.path,
			});
			onOpenChange(false);
		} catch (error) {
			if (error instanceof Error && error.message === EXPORT_CANCELLED_MESSAGE) {
				return; // user pressed Cancel; state is already cleared
			}
			// Render failures surface through exportState's inline error UI; only
			// post-render failures (e.g. publishing to Files denied) need a toast.
			if (editor.project.getExportState().result?.success !== false) {
				toast.error("Export failed", {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent
			side={side}
			align="end"
			sideOffset={8}
			className="bg-background flex w-80 flex-col p-0"
		>
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Unknown error occurred"}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between p-3 border-b">
						<h3 className="font-medium text-sm">
							{isExporting ? "Exporting project" : "Export project"}
						</h3>
					</div>

					<div className="flex flex-col gap-4">
						{!isExporting && (
							<>
								<div className="flex flex-col">
									<Section
										collapsible
										defaultOpen={false}
										showTopBorder={false}
									>
										<SectionHeader>
											<SectionTitle>Format</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value: string) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">
														MP4 (H.264) - Better compatibility
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">
														WebM (VP9) - Smaller file size
													</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mov" id="mov" />
													<Label htmlFor="mov">MOV - QuickTime container</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="gif" id="gif" />
													<Label htmlFor="gif">GIF - Animated image</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp3" id="mp3" />
													<Label htmlFor="mp3">MP3 - Audio only</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="wav" id="wav" />
													<Label htmlFor="wav">WAV - Audio only (lossless)</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									{format === "mov" && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>MOV codec</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<RadioGroup
													value={movCodec}
													onValueChange={(value: string) => {
														if (isExportMovCodec(value)) {
															setMovCodec(value);
														}
													}}
												>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="h264" id="mov-h264" />
														<Label htmlFor="mov-h264">H.264</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="prores" id="mov-prores" />
														<Label htmlFor="mov-prores">ProRes</Label>
													</div>
												</RadioGroup>
											</SectionContent>
										</Section>
									)}

									{(isVideo || isGif) && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Resolution</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<Select
													value={resolution}
													onValueChange={(value: string) => {
														if (isExportResolutionPreset(value)) {
															setResolution(value);
														}
													}}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Source" />
													</SelectTrigger>
													<SelectContent>
														{EXPORT_RESOLUTION_PRESETS.map((preset) => (
															<SelectItem key={preset.id} value={preset.id}>
																{preset.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</SectionContent>
										</Section>
									)}

									{(isVideo || isGif) && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Frame rate</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<Select
													value={fps === null ? "source" : String(fps)}
													onValueChange={(value: string) => {
														setFps(
															value === "source" ? null : Number(value),
														);
													}}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Source" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="source">
															Source (
															{Math.round(
																frameRateToFloat(activeProject.settings.fps),
															)}{" "}
															fps)
														</SelectItem>
														{EXPORT_FPS_OPTIONS.map((option) => (
															<SelectItem key={option} value={String(option)}>
																{option} fps
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</SectionContent>
										</Section>
									)}

									{(isVideo || format === "mp3") && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Quality</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<RadioGroup
													value={quality}
													onValueChange={(value: string) => {
														if (isExportQuality(value)) {
															setQuality(value);
														}
													}}
												>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="low" id="low" />
														<Label htmlFor="low">Low - Smallest file size</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="medium" id="medium" />
														<Label htmlFor="medium">Medium - Balanced</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="high" id="high" />
														<Label htmlFor="high">High - Recommended</Label>
													</div>
													<div className="flex items-center space-x-2">
														<RadioGroupItem value="very_high" id="very_high" />
														<Label htmlFor="very_high">
															Very high - Largest file size
														</Label>
													</div>
												</RadioGroup>
											</SectionContent>
										</Section>
									)}

									{isVideo && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Bitrate</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<Select
													value={bitrateMbps === null ? "auto" : String(bitrateMbps)}
													onValueChange={(value: string) => {
														setBitrateMbps(
															value === "auto" ? null : Number(value),
														);
													}}
												>
													<SelectTrigger className="w-full">
														<SelectValue placeholder="Auto (from quality)" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="auto">Auto (from quality)</SelectItem>
														{EXPORT_BITRATE_MBPS_OPTIONS.map((option) => (
															<SelectItem key={option} value={String(option)}>
																{option} Mbps
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</SectionContent>
										</Section>
									)}

									{isVideo && (
										<Section collapsible defaultOpen={false}>
											<SectionHeader>
												<SectionTitle>Audio</SectionTitle>
											</SectionHeader>
											<SectionContent>
												<div className="flex items-center space-x-2">
													<Checkbox
														id="include-audio"
														checked={shouldIncludeAudio}
														onCheckedChange={(checked: boolean | "indeterminate") =>
															setShouldIncludeAudio(!!checked)
														}
													/>
													<Label htmlFor="include-audio">
														Include audio in export
													</Label>
												</div>
											</SectionContent>
										</Section>
									)}
								</div>

								<div className="p-3 pt-0">
									<Button onClick={handleExport} className="w-full gap-2">
										<Download className="size-4" />
										Export
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{Math.round(progress * 100)}%
										</p>
										<p className="text-muted-foreground text-sm">100%</p>
									</div>
									<Progress value={progress * 100} className="w-full" />
								</div>

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									Cancel
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">Export failed</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					Retry
				</Button>
			</div>
		</div>
	);
}
