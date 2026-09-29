"use client";

import { useRef } from "react";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	transitionsRegistry,
	DEFAULT_TRANSITION_DURATION_SECONDS,
	type Transition,
} from "@/transitions";
import type { ImageElement, VideoElement } from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";

const MIN_DURATION_SECONDS = 0.1;
const MAX_DURATION_SECONDS = 5;

function formatDuration({ seconds }: { seconds: number }): string {
	return `${Math.round(seconds * 100) / 100}s`;
}

function parseDuration({ input }: { input: string }): number | null {
	const parsed = Number.parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return Math.min(
		MAX_DURATION_SECONDS,
		Math.max(MIN_DURATION_SECONDS, parsed),
	);
}

export function TransitionTab({
	element,
	trackId,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
}) {
	return (
		<div className="flex flex-col">
			<TransitionEdgeSection
				element={element}
				trackId={trackId}
				edge="in"
				label="In"
			/>
			<TransitionEdgeSection
				element={element}
				trackId={trackId}
				edge="out"
				label="Out"
			/>
		</div>
	);
}

function TransitionEdgeSection({
	element,
	trackId,
	edge,
	label,
}: {
	element: VideoElement | ImageElement;
	trackId: string;
	edge: "in" | "out";
	label: string;
}) {
	const editor = useEditor();
	const definitions = transitionsRegistry.getAll();
	const field = edge === "in" ? "transitionIn" : "transitionOut";
	const transition: Transition | undefined =
		edge === "in" ? element.transitionIn : element.transitionOut;
	const durationSeconds = transition
		? mediaTimeToSeconds({ time: transition.duration })
		: DEFAULT_TRANSITION_DURATION_SECONDS;
	const pendingSecondsRef = useRef(durationSeconds);

	const applyType = (type: string) => {
		if (type === "none") {
			editor.timeline.removeClipTransition({
				trackId,
				elementId: element.id,
				edge,
			});
			return;
		}
		editor.timeline.setClipTransition({
			trackId,
			elementId: element.id,
			edge,
			transitionType: type,
		});
	};

	const previewDuration = (seconds: number) => {
		pendingSecondsRef.current = seconds;
		if (!transition) return;
		const next: Transition = {
			...transition,
			duration: mediaTimeFromSeconds({ seconds }),
		};
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { [field]: next },
				},
			],
		});
	};

	const commitDuration = () => {
		if (!transition) return;
		editor.timeline.setClipTransition({
			trackId,
			elementId: element.id,
			edge,
			transitionType: transition.type,
			duration: mediaTimeFromSeconds({ seconds: pendingSecondsRef.current }),
		});
	};

	const durationDraft = usePropertyDraft({
		displayValue: formatDuration({ seconds: durationSeconds }),
		parse: (input) => parseDuration({ input }),
		onPreview: (seconds) => previewDuration(seconds),
		onCommit: () => commitDuration(),
	});

	return (
		<Section collapsible sectionKey={`${element.id}:transition-${edge}`}>
			<SectionHeader>
				<SectionTitle>Transition {label}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField label="Type">
						<Select
							value={transition?.type ?? "none"}
							onValueChange={(value) => applyType(value)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{definitions.map((definition) => (
									<SelectItem key={definition.type} value={definition.type}>
										{definition.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SectionField>
					{transition && (
						<SectionField label="Duration">
							<NumberField
								value={durationDraft.displayValue}
								suffix="s"
								scrubRanges={[
									{ from: 0.1, to: 5, pixelsPerUnit: 24 },
								]}
								scrubClamp={{
									min: MIN_DURATION_SECONDS,
									max: MAX_DURATION_SECONDS,
								}}
								onFocus={() => {
									pendingSecondsRef.current = durationSeconds;
									durationDraft.onFocus();
								}}
								onChange={durationDraft.onChange}
								onBlur={durationDraft.onBlur}
								onScrub={durationDraft.scrubTo}
								onScrubEnd={durationDraft.commitScrub}
								onReset={() => {}}
								isDefault={false}
							/>
						</SectionField>
					)}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
