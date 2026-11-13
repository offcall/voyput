import type { VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { flag, formatInt, NoData } from "./format";

/** Countries by number of photos, with share and a bar. */
export function CountriesTable({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
	const { countries, photoCount } = data;
	if (countries.length === 0) return <NoData />;
	const max = countries[0]?.photos ?? 1;
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-scroll">
				<table className="vp-viz-table">
					<caption className="vp-viz-muted">Countries by photos</caption>
					<thead>
						<tr>
							<th>#</th>
							<th>Country</th>
							<th>Photos</th>
							<th>Share</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{countries.map((c, i) => (
							<tr key={c.code}>
								<td>{i + 1}</td>
								<td>
									{flag(c.code)} {c.country}
								</td>
								<td>{formatInt(c.photos)}</td>
								<td>{Math.round((c.photos / photoCount) * 1000) / 10}%</td>
								<td className="vp-viz-share">
									<div className="vp-viz-share-track">
										{" "}
										<div
											className="vp-viz-share-bar"
											style={{
												width: `${Math.max(2, Math.round((c.photos / max) * 100))}%`,
												background: countryColor(c.code),
											}}
										/>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</figure>
	);
}
