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
}: {
	items: TabItem[];
	defaultValue?: string;
}) {
	return (
		<BaseTabs.Root defaultValue={defaultValue ?? items[0]?.value}>
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
