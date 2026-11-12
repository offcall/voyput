import type { VizData } from "@voyput/core";
import { flag, formatInt, NoData } from "./format";

/** Country periods in order, as a flag sequence and a table. */
export function MovementsTable({ data }: { data: VizData }) {
	const { movements } = data;
	if (movements.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<p className="vp-viz-flags" role="img" aria-label="Sequence of countries">
				{movements.map((m) => flag(m.code)).join("")}
			</p>
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
								{flag(m.code)} {m.country}
							</td>
							<td>{m.start}</td>
							<td>{m.end}</td>
							<td>{formatInt(m.photos)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</figure>
	);
}
