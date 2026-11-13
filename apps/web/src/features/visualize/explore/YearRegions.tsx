import { REGIONS, type Region, type YearRow } from "@voyput/core";
import { formatInt } from "../charts/format";

/** Fixed colours per region (regions are few and stable, unlike countries). */
const REGION_COLOURS: Readonly<Record<Region, string>> = {
	Europe: "var(--vp-cat-1)",
	Asia: "var(--vp-cat-2)",
	Americas: "var(--vp-cat-3)",
	Africa: "var(--vp-cat-6)",
	Oceania: "var(--vp-cat-7)",
	Antarctica: "var(--vp-cat-10)",
	Other: "var(--vp-pixel-grey)",
};

/** Each year as one bar split by region, 100% = the year's days in the selection. */
export function YearRegions({
	rows,
	onYear,
}: {
	rows: readonly YearRow[];
	onYear: (year: number) => void;
}) {
	const used = new Set(
		rows.flatMap((r) =>
			r.regions.filter((x) => x.days > 0).map((x) => x.region),
		),
	);
	return (
		<>
			<div className="vp-explore-years">
				{rows.map((row) => (
					<div key={row.year} className="vp-explore-year-row">
						<button
							type="button"
							className="vp-explore-lane-year"
							onClick={() => onYear(row.year)}
							aria-label={`Show ${row.year}`}
						>
							{row.year}
						</button>
						<div
							className="vp-explore-stack"
							role="img"
							aria-label={`${row.year}: ${row.regions
								.filter((r) => r.days > 0)
								.map((r) => `${r.region} ${r.days} days`)
								.join(", ")}`}
						>
							{row.regions
								.filter((r) => r.days > 0)
								.map((r) => (
									<span
										key={r.region}
										className="vp-explore-seg"
										title={`${r.region}: ${r.days} days`}
										style={{
											width: `${(r.days / row.days) * 100}%`,
											background: REGION_COLOURS[r.region],
										}}
									/>
								))}
						</div>
						<span className="vp-explore-year-meta">
							<b>{formatInt(row.days)}</b> d · {row.countries} ctry
						</span>
					</div>
				))}
			</div>
			<div className="vp-viz-legend">
				{REGIONS.filter((r) => used.has(r)).map((r) => (
					<span key={r}>
						<i style={{ background: REGION_COLOURS[r] }} />
						{r}
					</span>
				))}
			</div>
		</>
	);
}
