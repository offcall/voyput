import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactNode } from "react";

export interface MenuItem {
	label: ReactNode;
	onSelect: () => void;
	/** danger: red text, for deleting. */
	tone?: "default" | "danger";
}

/** A "⋯" button that opens a short list of actions. */
export function Menu({
	label,
	items,
}: {
	/** Accessible name of the trigger, e.g. "More for Blue passport". */
	label: string;
	items: MenuItem[];
}) {
	return (
		<BaseMenu.Root>
			<BaseMenu.Trigger
				className="vp-button vp-menu-trigger"
				data-variant="ghost"
				data-size="sm"
				data-square=""
				aria-label={label}
			>
				<span aria-hidden="true">⋯</span>
			</BaseMenu.Trigger>
			<BaseMenu.Portal>
				<BaseMenu.Positioner sideOffset={4} align="end">
					<BaseMenu.Popup className="vp-menu-popup">
						{items.map((item, index) => (
							<BaseMenu.Item
								// biome-ignore lint/suspicious/noArrayIndexKey: a fixed list per render.
								key={index}
								className="vp-menu-item"
								data-tone={item.tone === "danger" ? "danger" : undefined}
								onClick={item.onSelect}
							>
								{item.label}
							</BaseMenu.Item>
						))}
					</BaseMenu.Popup>
				</BaseMenu.Positioner>
			</BaseMenu.Portal>
		</BaseMenu.Root>
	);
}
