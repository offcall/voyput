import type { ExploreFilters as Filters, Stay } from "@voyput/core";
import { Button } from "@voyput/ui";
import { ExploreFilters } from "./explore/ExploreFilters";
import { activeFilterChips } from "./filterChips";

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
			variant={active > 0 ? "secondary" : "default"}
			aria-expanded={open}
			aria-controls="vp-insights-filters"
			onClick={onToggle}
		>
			{active > 0 ? `Filter · ${active}` : "Filter"}{" "}
			<span aria-hidden="true">{open ? "▴" : "▾"}</span>
		</Button>
	);
}

/**
 * The active filters as small removable chips, and the full filter panel when
 * open. One filter state for every Insights view.
 */
export function FilterBar({
	stays,
	filters,
	defaults,
	open,
	scope,
	onChange,
	onReset,
}: {
	stays: readonly Stay[];
	filters: Filters;
	defaults: Filters;
	open: boolean;
	/** "4 of 6 stays · from – to", read out when it changes. */
	scope: string;
	onChange: (patch: Partial<Filters>) => void;
	onReset: () => void;
}) {
	const chips = activeFilterChips(filters, defaults, stays);
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
			{open ? (
				<div id="vp-insights-filters">
					<ExploreFilters
						stays={stays}
						filters={filters}
						defaults={defaults}
						onChange={onChange}
						onReset={onReset}
						scope={scope}
					/>
				</div>
			) : null}
		</>
	);
}
