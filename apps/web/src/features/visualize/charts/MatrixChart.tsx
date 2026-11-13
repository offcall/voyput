import type { CountryStat, VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { flag, formatInt, NoData, OTHER_COLOR } from "./format";

const TOP = 24;

function yearCount(country: CountryStat, year: string): number {
	return country.years[year] ?? 0;
}

function sumYear(countries: readonly CountryStat[], year: string): number {
	return countries.reduce((sum, c) => sum + yearCount(c, year), 0);
}

/** Colour with alpha for `hsl(...)` strings and `#rrggbb`. */
function withAlpha(color: string, alpha: number): string {
	if (color.startsWith("var("))
		return `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(1)}%, transparent)`;
	if (color.startsWith("#")) {
		const n = Number.parseInt(color.slice(1), 16);
		return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha.toFixed(3)})`;
	}
	return color
		.replace(/^hsl\(/, "hsla(")
		.replace(/\)$/, `,${alpha.toFixed(3)})`);
}

export function MatrixChart({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
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
		title: string,
	) => (
		<td
			key={key}
			title={count > 0 ? title : undefined}
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
					cell(
						years[i] ?? `${i}`,
						count,
						color,
						`${label} · ${years[i]} · ${formatInt(count)} photos`,
					),
				)}
				{cell(
					"total",
					total,
					color,
					`${label} · total · ${formatInt(total)} photos`,
				)}
			</tr>
		);
	};

	return (
		<figure className="vp-viz-figure vp-viz-scroll">
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
					{row("all", "All countries", countries, null, "vp-viz-total")}
					{top.map((c) =>
						row(
							c.code,
							`${flag(c.code)} ${c.country}`,
							[c],
							countryColor(c.code),
						),
					)}
					{rest.length > 0 ? row("other", "Other", rest, OTHER_COLOR) : null}
				</tbody>
			</table>
			<figcaption className="vp-viz-muted">
				Stronger colour means more photos
			</figcaption>
		</figure>
	);
}
