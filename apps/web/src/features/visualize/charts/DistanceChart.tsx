import type { VizData } from "@voyput/core";
import { Stat, StatGroup } from "@voyput/ui";
import { flag, formatInt, NoData } from "./format";
import { LineChart } from "./LineChart";

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

	return (
		<figure className="vp-viz-figure">
			<StatGroup>
				{stats.map(([label, value]) => (
					<Stat key={label} label={label} value={value} />
				))}
			</StatGroup>
			<h3 className="vp-viz-subtitle">Kilometres per year</h3>
			<LineChart
				label="Kilometres per year"
				points={d.perYear.map((y) => ({ label: y.year, value: y.km }))}
				format={(km) => `${formatInt(km)} km`}
				showValues
			/>
			<div className="vp-viz-scroll">
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
			</div>
		</figure>
	);
}
