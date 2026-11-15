import type { CountryStat, VizData } from "@voyput/core";
import { CountryChip } from "@voyput/ui";
import { useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { useShowAll } from "../ShowAll";
import { formatInt, NoData } from "./format";
import "./countries.css";

type SortKey = "photos" | "country" | "first" | "years";

const firstYear = (c: CountryStat) => Object.keys(c.years).sort()[0] ?? "";
const lastYear = (c: CountryStat) => Object.keys(c.years).sort().at(-1) ?? "";
const yearCount = (c: CountryStat) => Object.keys(c.years).length;

/** Each key's natural first direction: most, A to Z, earliest, most. */
const compare: Record<SortKey, (a: CountryStat, b: CountryStat) => number> = {
	photos: (a, b) => b.photos - a.photos,
	country: (a, b) => a.country.localeCompare(b.country),
	first: (a, b) => firstYear(a).localeCompare(firstYear(b)),
	years: (a, b) => yearCount(b) - yearCount(a),
};

const COLUMNS: { key: SortKey; label: string }[] = [
	{ key: "country", label: "Country" },
	{ key: "photos", label: "Photos" },
	{ key: "first", label: "Years" },
	{ key: "years", label: "Active" },
];

/** Countries by number of photos, with share, years and a bar; sortable. */
export function CountriesTable({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
	const [sort, setSort] = useState<{ key: SortKey; flip: boolean }>({
		key: "photos",
		flip: false,
	});
	const { countries, photoCount } = data;
	const rows = [...countries].sort(
		(a, b) =>
			(sort.flip ? -1 : 1) * compare[sort.key](a, b) ||
			b.photos - a.photos ||
			a.code.localeCompare(b.code),
	);
	const { shown, toggle } = useShowAll(rows);
	if (countries.length === 0) return <NoData />;
	const max = Math.max(...countries.map((c) => c.photos), 1);
	// Rank stays by photos whatever the sort.
	const rank = new Map(countries.map((c, i) => [c.code, i + 1]));
	const ariaSort = (key: SortKey) => {
		if (sort.key !== key) return undefined;
		const ascending = key === "country" || key === "first";
		return ascending !== sort.flip ? "ascending" : "descending";
	};
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-scroll">
				<table className="vp-viz-table vp-countries">
					<caption className="vp-viz-muted">
						Countries by photos · sort by any column
					</caption>
					<thead>
						<tr>
							<th scope="col" className="vp-countries-rank">
								#
							</th>
							{COLUMNS.map((col) => (
								<th
									key={col.key}
									scope="col"
									aria-sort={ariaSort(col.key)}
									className={`vp-countries-${col.key}`}
								>
									<button
										type="button"
										className="vp-countries-sort"
										onClick={() =>
											setSort((s) => ({
												key: col.key,
												flip: s.key === col.key ? !s.flip : false,
											}))
										}
									>
										{col.label}
										<span aria-hidden="true">
											{sort.key !== col.key
												? ""
												: ariaSort(col.key) === "ascending"
													? " ▲"
													: " ▼"}
										</span>
									</button>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{shown.map((c) => {
							const share = (c.photos / photoCount) * 100;
							const first = firstYear(c);
							const last = lastYear(c);
							return (
								<tr key={c.code}>
									<td className="vp-countries-rank">{rank.get(c.code)}</td>
									<td>
										<CountryChip
											code={c.code}
											name={c.country}
											colour={countryColor(c.code)}
										/>
									</td>
									<td className="vp-countries-photos">
										<span className="vp-countries-bar-cell">
											<b className="vp-countries-num">{formatInt(c.photos)}</b>{" "}
											<span className="vp-countries-bar" aria-hidden="true">
												<span
													style={{
														width: `${Math.max(2, (c.photos / max) * 100)}%`,
														background: countryColor(c.code),
													}}
												/>
											</span>
											<span className="vp-countries-share">
												{Math.round(share * 10) / 10}%
											</span>
										</span>
									</td>
									<td>{first === last ? first : `${first}–${last}`}</td>
									<td>
										{yearCount(c)} {yearCount(c) === 1 ? "year" : "years"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{toggle}
		</figure>
	);
}
