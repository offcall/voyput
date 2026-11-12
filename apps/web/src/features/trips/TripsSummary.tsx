import type { Trip } from "@voyput/core";
import { dayCount } from "./format";
import { TripChip } from "./TripChip";

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
					{countries.map((cc) => (
						<TripChip key={cc} code={cc} />
					))}
				</div>
			) : null}
		</div>
	);
}
