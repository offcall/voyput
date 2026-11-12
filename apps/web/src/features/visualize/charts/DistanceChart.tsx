import type { VizData } from "@voyput/core";
import { flag, formatInt, NoData } from "./format";

function gap(hours: number): string {
	return hours < 48
		? `${Math.max(1, Math.round(hours))} h`
		: `${Math.round(hours / 24)} d`;
}

/** Distance between photos adjacent in time (haversine). */
export function DistanceChart({ data }: { data: VizData }) {
	const d = data.distances;
	if (d.segmentCount === 0) return <NoData />;
	const stats: [string, string][] = [
		["Total distance", `${formatInt(d.totalKm)} km`],
		["Longest jump", `${formatInt(d.longestKm)} km`],
		[
			"Per day on average",
			`${d.avgPerDayKm >= 100 ? formatInt(d.avgPerDayKm) : d.avgPerDayKm.toFixed(1)} km`,
		],
		["Time span", `${d.spanDays} days`],
		["Photo-to-photo steps", formatInt(d.segmentCount)],
	];
	const maxYear = Math.max(1, ...d.perYear.map((y) => y.km));

	return (
		<figure className="vp-viz-figure">
			<dl className="vp-viz-stats">
				{stats.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
			<div className="vp-viz-bars" role="img" aria-label="Kilometres per year">
				{d.perYear.map((y) => (
					<div
						key={y.year}
						className="vp-viz-bar-col"
						title={`${y.year} · ${formatInt(y.km)} km`}
					>
						<span>{formatInt(y.km)}</span>
						<div
							className="vp-viz-bar"
							style={{
								height: `${Math.max(3, Math.round((y.km / maxYear) * 100))}%`,
							}}
						/>
						<span className="vp-viz-muted">{y.year}</span>
					</div>
				))}
			</div>
			<table className="vp-viz-table">
				<caption className="vp-viz-muted">
					Ten longest jumps between consecutive photos
				</caption>
				<thead>
					<tr>
						<th>#</th>
						<th>From</th>
						<th>To</th>
						<th>Distance</th>
						<th>Date</th>
						<th>Gap</th>
					</tr>
				</thead>
				<tbody>
					{d.top.map((s, i) => (
						<tr key={`${s.fromDate}-${s.toDate}-${s.km}`}>
							<td>{i + 1}</td>
							<td>
								{flag(s.fromCode)} {s.fromCountry}
							</td>
							<td>
								{flag(s.toCode)} {s.toCountry}
							</td>
							<td>{formatInt(s.km)} km</td>
							<td>{s.fromDate}</td>
							<td>{gap(s.hours)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</figure>
	);
}
