"use client";

import {
	tabs,
	TAB_KEYS,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";

export function AssetsTabSwitcher() {
	const activeTab = useAssetsPanelStore((state) => state.activeTab);
	const setActiveTab = useAssetsPanelStore((state) => state.setActiveTab);
	const ActiveTabIcon = tabs[activeTab].icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="-ml-1.5 h-8 gap-1.5 px-2">
					<ActiveTabIcon className="size-4" />
					<span>{tabs[activeTab].label}</span>
					<HugeiconsIcon
						icon={ArrowDownIcon}
						className="text-muted-foreground size-3.5"
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				{TAB_KEYS.map((tabKey) => {
					const Icon = tabs[tabKey].icon;
					return (
						<DropdownMenuItem
							key={tabKey}
							icon={<Icon className="size-4" />}
							className={cn(tabKey === activeTab && "text-primary")}
							onSelect={() => setActiveTab(tabKey)}
						>
							{tabs[tabKey].label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
