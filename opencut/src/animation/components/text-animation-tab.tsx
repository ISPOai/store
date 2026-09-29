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
	DEFAULT_TEXT_ANIMATION_DURATION_SECONDS,
	MAX_TEXT_ANIMATION_DURATION_SECONDS,
	MIN_TEXT_ANIMATION_DURATION_SECONDS,
	getTextAnimationPresetDefinitions,
	isTextAnimationPresetName,
	type TextAnimationPhase,
	type TextAnimationPresetBinding,
} from "@/animation/presets";
import type { TextElement } from "@/timeline";

function bindingForPhase({
	element,
	phase,
}: {
	element: TextElement;
	phase: TextAnimationPhase;
}): TextAnimationPresetBinding | undefined {
	switch (phase) {
		case "in":
			return element.textAnimationIn;
		case "out":
			return element.textAnimationOut;
		case "loop":
			return element.textAnimationLoop;
	}
}

function formatDuration({ seconds }: { seconds: number }): string {
	return `${Math.round(seconds * 100) / 100}s`;
}

function parseDuration({ input }: { input: string }): number | null {
	const parsed = Number.parseFloat(input);
	if (Number.isNaN(parsed)) return null;
	return Math.min(
		MAX_TEXT_ANIMATION_DURATION_SECONDS,
		Math.max(MIN_TEXT_ANIMATION_DURATION_SECONDS, parsed),
	);
}

export function TextAnimationTab({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	return (
		<div className="flex flex-col">
			<TextAnimationPhaseSection
				element={element}
				trackId={trackId}
				phase="in"
				label="In"
			/>
			<TextAnimationPhaseSection
				element={element}
				trackId={trackId}
				phase="out"
				label="Out"
			/>
			<TextAnimationPhaseSection
				element={element}
				trackId={trackId}
				phase="loop"
				label="Loop"
			/>
		</div>
	);
}

function TextAnimationPhaseSection({
	element,
	trackId,
	phase,
	label,
}: {
	element: TextElement;
	trackId: string;
	phase: TextAnimationPhase;
	label: string;
}) {
	const editor = useEditor();
	const binding = bindingForPhase({ element, phase });
	const definitions = getTextAnimationPresetDefinitions().filter((definition) =>
		definition.phases.includes(phase),
	);
	const durationSeconds =
		binding?.durationSeconds ?? DEFAULT_TEXT_ANIMATION_DURATION_SECONDS;
	const pendingSecondsRef = useRef(durationSeconds);

	const applyType = (value: string) => {
		if (value === "none") {
			editor.timeline.removeTextAnimationPreset({
				trackId,
				elementId: element.id,
				phase,
			});
			return;
		}
		if (!isTextAnimationPresetName(value)) {
			return;
		}
		editor.timeline.applyTextAnimationPreset({
			trackId,
			elementId: element.id,
			phase,
			presetName: value,
			durationSeconds: pendingSecondsRef.current,
		});
	};

	const commitDuration = () => {
		if (!binding) return;
		editor.timeline.applyTextAnimationPreset({
			trackId,
			elementId: element.id,
			phase,
			presetName: binding.preset,
			durationSeconds: pendingSecondsRef.current,
		});
	};

	const durationDraft = usePropertyDraft({
		displayValue: formatDuration({ seconds: durationSeconds }),
		parse: (input) => parseDuration({ input }),
		onPreview: (seconds) => {
			pendingSecondsRef.current = seconds;
		},
		onCommit: () => commitDuration(),
	});

	return (
		<Section collapsible sectionKey={`${element.id}:text-animation-${phase}`}>
			<SectionHeader>
				<SectionTitle>Animation {label}</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField label="Preset">
						<Select
							value={binding?.preset ?? "none"}
							onValueChange={(value) => applyType(value)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{definitions.map((definition) => (
									<SelectItem key={definition.name} value={definition.name}>
										{definition.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</SectionField>
					{binding && (
						<SectionField label="Duration">
							<NumberField
								value={durationDraft.displayValue}
								suffix="s"
								scrubRanges={[
									{
										from: MIN_TEXT_ANIMATION_DURATION_SECONDS,
										to: MAX_TEXT_ANIMATION_DURATION_SECONDS,
										pixelsPerUnit: 24,
									},
								]}
								scrubClamp={{
									min: MIN_TEXT_ANIMATION_DURATION_SECONDS,
									max: MAX_TEXT_ANIMATION_DURATION_SECONDS,
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
