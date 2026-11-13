import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export interface TabItem {
	value: string;
	label: ReactNode;
	content: ReactNode;
}

export function Tabs({
	items,
	defaultValue,
	value,
	onValueChange,
}: {
	items: TabItem[];
	defaultValue?: string;
	/** Controlled mode: the open tab, changed through `onValueChange`. */
	value?: string;
	onValueChange?: (value: string) => void;
}) {
	return (
		<BaseTabs.Root
			defaultValue={defaultValue ?? items[0]?.value}
			{...(value === undefined ? {} : { value })}
			onValueChange={(next: unknown) => {
				if (typeof next === "string") onValueChange?.(next);
			}}
		>
			<BaseTabs.List className="vp-tabs-list">
				{items.map((item) => (
					<BaseTabs.Tab key={item.value} value={item.value} className="vp-tab">
						{item.label}
					</BaseTabs.Tab>
				))}
			</BaseTabs.List>
			{items.map((item) => (
				<BaseTabs.Panel key={item.value} value={item.value}>
					{item.content}
				</BaseTabs.Panel>
			))}
		</BaseTabs.Root>
	);
}
