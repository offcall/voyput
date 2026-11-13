import type { VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { formatInt, NoData } from "./format";
import { useMarkTip } from "./useMarkTip";

/** Country periods in order, as a strip of country chips and a table. */
export function MovementsTable({ data }: { data: VizData }) {
	const colour = useCountryColour();
	const { hostRef, mark, tip } = useMarkTip();
	const { movements } = data;
	if (movements.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-tipped" ref={hostRef}>
				<ol className="vp-viz-chips" aria-label="Sequence of countries">
					{movements.map((m, i) => (
						<li key={`${m.range}-${m.start}`}>
							<span
								className="vp-viz-chip"
								style={{ background: colour(m.code) }}
								{...mark(`${i}`, {
									label: `${m.country} · ${m.start} – ${m.end}`,
									value: `${formatInt(m.photos)} photos`,
								})}
							>
								{m.code}
							</span>
						</li>
					))}
				</ol>
				{tip}
			</div>
			<div className="vp-viz-scroll">
				<table className="vp-viz-table">
					<caption className="vp-viz-muted">
						{movements.length} periods · a day counts for its most photographed
						country
					</caption>
					<thead>
						<tr>
							<th>#</th>
							<th>Country</th>
							<th>From</th>
							<th>To</th>
							<th>Photos</th>
						</tr>
					</thead>
					<tbody>
						{movements.map((m, i) => (
							<tr key={`${m.range}-${m.start}`}>
								<td>{i + 1}</td>
								<td>
									<span
										className="vp-viz-chip vp-viz-chip-sm"
										aria-hidden="true"
										style={{ background: colour(m.code) }}
									>
										{m.code}
									</span>{" "}
									{m.country}
								</td>
								<td>{m.start}</td>
								<td>{m.end}</td>
								<td>{formatInt(m.photos)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</figure>
	);
}
