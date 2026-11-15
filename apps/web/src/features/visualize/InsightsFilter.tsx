import type { ExploreFilters as Filters, Stay } from "@voyput/core";
import { Button } from "@voyput/ui";
import { type ReactNode, useEffect, useRef } from "react";
import { ExploreFilters } from "./explore/ExploreFilters";
import { activeFilterChips } from "./filterChips";
import { usePhone } from "./usePhone";

const PANEL_ID = "vp-insights-filters";

/** The Filter button for the page header; it opens the filter panel below it. */
export function FilterButton({
	open,
	active,
	onToggle,
}: {
	open: boolean;
	/** Number of active filters, shown on the button. */
	active: number;
	onToggle: () => void;
}) {
	return (
		<Button
			size="sm"
			className="vp-insights-page-filter"
			variant={active > 0 ? "secondary" : "default"}
			aria-expanded={open}
			aria-controls={PANEL_ID}
			onClick={onToggle}
		>
			{active > 0 ? `Filter · ${active}` : "Filter"}{" "}
			<span aria-hidden="true">{open ? "▴" : "▾"}</span>
		</Button>
	);
}

/**
 * The filter panel as a bottom sheet over the page (phones): Done, Escape or a
 * tap on the dimmed page closes it, and focus goes back to the Filter button.
 */
function FilterSheet({
	onClose,
	children,
}: {
	onClose: () => void;
	children: ReactNode;
}) {
	const sheet = useRef<HTMLDivElement>(null);
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		sheet.current?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") close.current();
		};
		document.addEventListener("keydown", onKey);
		// The page behind does not scroll while the sheet is open.
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
			// Back to the Filter button (Safari does not focus a tapped button).
			document
				.querySelector<HTMLElement>(`[aria-controls="${PANEL_ID}"]`)
				?.focus();
		};
	}, []);
	return (
		<>
			<div
				className="vp-insights-sheet-backdrop"
				aria-hidden="true"
				onClick={onClose}
			/>
			<div
				ref={sheet}
				id={PANEL_ID}
				className="vp-insights-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="vp-insights-sheet-title"
				tabIndex={-1}
			>
				<header className="vp-insights-sheet-head">
					<h2 id="vp-insights-sheet-title">Filter</h2>
					<Button size="sm" variant="primary" onClick={onClose}>
						Done
					</Button>
				</header>
				{children}
			</div>
		</>
	);
}

/**
 * The active filters as small removable chips, and the full filter panel when
 * open: below the header, or a bottom sheet on phones. One filter state for
 * every Insights view.
 */
export function FilterBar({
	stays,
	filters,
	defaults,
	open,
	scope,
	onChange,
	onReset,
	onClose,
}: {
	stays: readonly Stay[];
	filters: Filters;
	defaults: Filters;
	open: boolean;
	/** "4 of 6 stays · from – to", read out when it changes. */
	scope: string;
	onChange: (patch: Partial<Filters>) => void;
	onReset: () => void;
	/** Closes the panel (the sheet's Done, Escape, backdrop). */
	onClose: () => void;
}) {
	const phone = usePhone();
	const chips = activeFilterChips(filters, defaults, stays);
	const panel = (
		<ExploreFilters
			stays={stays}
			filters={filters}
			defaults={defaults}
			onChange={onChange}
			onReset={onReset}
			scope={scope}
		/>
	);
	return (
		<>
			{chips.length > 0 ? (
				<ul className="vp-insights-chips" aria-label="Active filters">
					{chips.map((chip) => (
						<li key={chip.id}>
							<button
								type="button"
								className="vp-insights-chip"
								aria-label={`Remove filter: ${chip.label}`}
								onClick={() => onChange(chip.remove)}
							>
								{chip.label} <span aria-hidden="true">×</span>
							</button>
						</li>
					))}
					<li>
						<button
							type="button"
							className="vp-insights-clear"
							onClick={onReset}
						>
							Clear all
						</button>
					</li>
				</ul>
			) : null}
			{open && phone ? (
				<FilterSheet onClose={onClose}>{panel}</FilterSheet>
			) : open ? (
				<div id={PANEL_ID}>{panel}</div>
			) : null}
		</>
	);
}
