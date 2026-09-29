"use client";

import {
	type Tab,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { AssetsTabSwitcher } from "@/components/editor/panels/assets/tab-switcher";
import { Captions } from "@/subtitles/components/assets-view";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "@/sounds/components/assets-view";
import { StickersView } from "@/stickers/components/assets-view";
import { TextView } from "@/text/components/assets-view";
import { EffectsView } from "@/effects/components/assets-view";
import { LutsView } from "@/effects/components/luts-view";
import { FiltersView } from "@/effects/components/filters-view";
import { TransitionsView } from "@/transitions/components/assets-view";

/** Tabs whose view renders its own PanelView header (which hosts the switcher). */
const TABS_WITH_PANEL_HEADER: ReadonlySet<Tab> = new Set<Tab>([
	"media",
	"text",
	"effects",
	"luts",
	"filters",
	"transitions",
	"captions",
	"settings",
]);

export function AssetsPanel() {
	const activeTab = useAssetsPanelStore((state) => state.activeTab);

	const viewMap: Record<Tab, React.ReactNode> = {
		media: <MediaView />,
		sounds: <SoundsView />,
		text: <TextView />,
		stickers: <StickersView />,
		effects: <EffectsView />,
		luts: <LutsView />,
		filters: <FiltersView />,
		transitions: <TransitionsView />,
		captions: <Captions />,
		adjustment: (
			<div className="text-muted-foreground p-4">
				Adjustment view coming soon...
			</div>
		),
		settings: <SettingsView />,
	};

	return (
		<div className="bg-background flex h-full flex-col overflow-hidden">
			{!TABS_WITH_PANEL_HEADER.has(activeTab) && (
				<div className="flex h-11 shrink-0 items-center border-b pl-3 pr-2">
					<AssetsTabSwitcher />
				</div>
			)}
			<div className="min-h-0 flex-1 overflow-hidden">{viewMap[activeTab]}</div>
		</div>
	);
}
