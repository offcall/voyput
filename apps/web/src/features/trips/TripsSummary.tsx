import type { Trip } from "@voyput/core";
import { useState } from "react";
import { dayCount } from "./format";
import { TripChip } from "./TripChip";

/** Country chips shown before "+N more". */
const COLLAPSED_CHIPS = 16;

/** Totals over all listed trips. */
export function TripsSummary({
	trips,
	home,
}: {
	trips: readonly Trip[];
	home: string | null;
}) {
	const days = trips.reduce((sum, t) => sum + dayCount(t.start, t.end), 0);
	const countries = [
		...new Set(trips.flatMap((t) => t.stops.map((s) => s.countryCode))),
	]
		.filter((cc) => cc !== home)
		.sort();
	const open = trips.filter((t) => !t.confirmed).length;
	const [expanded, setExpanded] = useState(false);
	const shown = expanded ? countries : countries.slice(0, COLLAPSED_CHIPS);
	const hidden = countries.length - shown.length;
	return (
		<div className="vp-trips-summary">
			<div className="vp-trips-stat">
				<strong className="vp-trips-stat-value">{trips.length}</strong>
				<span>trips</span>
			</div>
			<div className="vp-trips-stat">
				<strong className="vp-trips-stat-value">{days}</strong>
				<span>days abroad</span>
			</div>
			<div className="vp-trips-stat">
				<strong className="vp-trips-stat-value">{countries.length}</strong>
				<span>countries</span>
			</div>
			<div className="vp-trips-stat" data-tone={open ? "warn" : "good"}>
				<strong className="vp-trips-stat-value">{open}</strong>
				<span>to confirm</span>
			</div>
			{countries.length ? (
				<div className="vp-trips-summary-countries">
					{shown.map((cc) => (
						<TripChip key={cc} code={cc} />
					))}
					{countries.length > COLLAPSED_CHIPS ? (
						<button
							type="button"
							className="vp-trips-chips-toggle"
							aria-expanded={expanded}
							onClick={() => setExpanded(!expanded)}
						>
							{expanded ? "Show less" : `+${hidden} more`}
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
