import { Button } from "@voyput/ui";
import { useEffect, useRef, useState } from "react";

export interface MoreItem {
	label: string;
	/** Shown muted under the label. */
	note?: string;
	/** Set for a choice of several: whether it is the one chosen. */
	checked?: boolean;
	disabled?: boolean;
	onSelect: () => void;
}

/** A "⋯" button with a short menu of rarer actions; closes on a pick, Escape or a click outside. */
export function MoreMenu({
	label,
	items,
}: {
	label: string;
	items: readonly MoreItem[];
}) {
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const outside = (e: PointerEvent) => {
			if (!root.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className="vp-more" ref={root}>
			<Button
				size="sm"
				variant="ghost"
				square
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				title={label}
				onClick={() => setOpen(!open)}
			>
				⋯
			</Button>
			{open ? (
				<div className="vp-more-menu" role="menu" aria-label={label}>
					{items.map((item) => {
						const pick = () => {
							setOpen(false);
							item.onSelect();
						};
						const body = (
							<>
								<span className="vp-more-check" aria-hidden="true">
									{item.checked ? "✓" : ""}
								</span>
								<span>
									{item.label}
									{item.note ? (
										<span className="vp-more-note">{item.note}</span>
									) : null}
								</span>
							</>
						);
						return item.checked === undefined ? (
							<button
								key={item.label}
								type="button"
								role="menuitem"
								disabled={item.disabled}
								className="vp-more-item"
								onClick={pick}
							>
								{body}
							</button>
						) : (
							<button
								key={item.label}
								type="button"
								role="menuitemradio"
								aria-checked={item.checked}
								disabled={item.disabled}
								className="vp-more-item"
								onClick={pick}
							>
								{body}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
