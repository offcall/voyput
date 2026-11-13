import type { CountryStat, VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";

import { flag, formatInt, NoData, OTHER_COLOR } from "./format";
import { type TipText, useMarkTip } from "./useMarkTip";

const TOP = 24;

function yearCount(country: CountryStat, year: string): number {
	return country.years[year] ?? 0;
}

function sumYear(countries: readonly CountryStat[], year: string): number {
	return countries.reduce((sum, c) => sum + yearCount(c, year), 0);
}

/** Any CSS colour (also `var(--vp-…)`) at the given opacity. */
function withAlpha(color: string, alpha: number): string {
	return `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`;
}

export function MatrixChart({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
	const { hostRef, mark, tip } = useMarkTip<HTMLElement>();
	const { years, countries } = data;
	if (countries.length === 0) return <NoData />;
	const top = countries.slice(0, TOP);
	const rest = countries.slice(TOP);
	const yearTotals = years.map((year) => sumYear(countries, year));
	const grandTotal = yearTotals.reduce((a, b) => a + b, 0);
	const max = Math.max(1, grandTotal);

	const cell = (
		key: string,
		count: number,
		color: string | null,
		text: TipText,
	) => (
		<td
			key={key}
			{...(count > 0 ? mark(text.label, text, null) : {})}
			style={
				count > 0 && color
					? {
							background: withAlpha(
								color,
								0.12 + 0.75 * Math.sqrt(count / max),
							),
						}
					: undefined
			}
		>
			{count > 0 ? formatInt(count) : ""}
		</td>
	);

	const row = (
		key: string,
		label: string,
		name: string,
		list: readonly CountryStat[],
		color: string | null,
		className?: string,
	) => {
		const counts = years.map((year) => sumYear(list, year));
		const total = counts.reduce((a, b) => a + b, 0);
		return (
			<tr key={key} className={className}>
				<th scope="row">{label}</th>
				{counts.map((count, i) =>
					cell(years[i] ?? `${i}`, count, color, {
						label: `${name} · ${years[i]}`,
						value: `${formatInt(count)} photos`,
					}),
				)}
				{cell("total", total, color, {
					label: `${name} · total`,
					value: `${formatInt(total)} photos`,
				})}
			</tr>
		);
	};

	return (
		<figure className="vp-viz-figure vp-viz-tipped" ref={hostRef}>
			<div className="vp-viz-scroll">
				<table className="vp-viz-table vp-viz-matrix">
					<thead>
						<tr>
							<th />
							{years.map((year) => (
								<th key={year} scope="col">
									{year}
								</th>
							))}
							<th scope="col">Total</th>
						</tr>
					</thead>
					<tbody>
						{row(
							"all",
							"All countries",
							"All countries",
							countries,
							null,
							"vp-viz-total",
						)}
						{top.map((c) =>
							row(
								c.code,
								`${flag(c.code)} ${c.country}`,
								c.country,
								[c],
								countryColor(c.code),
							),
						)}
						{rest.length > 0
							? row("other", "Other", "Other", rest, OTHER_COLOR)
							: null}
					</tbody>
				</table>
			</div>
			{tip}
			<figcaption className="vp-viz-muted">
				Stronger colour means more photos
			</figcaption>
		</figure>
	);
}
