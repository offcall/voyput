import type { VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { flag, formatInt, NoData, OTHER_COLOR } from "./format";
import { useMarkTip } from "./useMarkTip";

const R1 = 62;
const R2 = 44;
const C = 75;
const SLICES = 6;

function point(r: number, a: number): string {
	return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
}

/** Ring segment between angles a0 and a1; a full ring is drawn as two halves. */
function ringPath(a0: number, a1: number): string {
	if (a1 - a0 >= 2 * Math.PI - 1e-4) {
		const mid = a0 + Math.PI;
		return (
			`M${point(R1, a0)}A${R1},${R1} 0 1 1 ${point(R1, mid)}A${R1},${R1} 0 1 1 ${point(R1, a1)}` +
			`L${point(R2, a1)}A${R2},${R2} 0 1 0 ${point(R2, mid)}A${R2},${R2} 0 1 0 ${point(R2, a0)}Z`
		);
	}
	const large = a1 - a0 > Math.PI ? 1 : 0;
	return (
		`M${point(R1, a0)}A${R1},${R1} 0 ${large} 1 ${point(R1, a1)}` +
		`L${point(R2, a1)}A${R2},${R2} 0 ${large} 0 ${point(R2, a0)}Z`
	);
}

/** One ring per year: share of photos by country. */
export function DonutChart({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
	const { hostRef, mark, tip } = useMarkTip();
	const rings = data.years.flatMap((year) => {
		const parts = data.countries
			.map((c) => ({
				code: c.code,
				name: c.country,
				count: c.years[year] ?? 0,
			}))
			.filter((p) => p.count > 0)
			.sort((a, b) => b.count - a.count);
		const total = parts.reduce((s, p) => s + p.count, 0);
		if (total === 0) return [];
		const segments = parts.slice(0, SLICES);
		const rest = parts.slice(SLICES).reduce((s, p) => s + p.count, 0);
		if (rest > 0) segments.push({ code: "", name: "Other", count: rest });
		let a0 = -Math.PI / 2;
		const arcs = segments.map((s) => {
			const a1 = a0 + (s.count / total) * 2 * Math.PI;
			const arc = { ...s, d: ringPath(a0, a1) };
			a0 = a1;
			return arc;
		});
		return [{ year, total, arcs }];
	});
	if (rings.length === 0) return <NoData />;
	const legend = data.countries.slice(0, 8);

	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-legend">
				{legend.map((c) => (
					<span key={c.code}>
						<i style={{ background: countryColor(c.code) }} />
						{flag(c.code)} {c.country}
					</span>
				))}
				<span>
					<i style={{ background: OTHER_COLOR }} />
					Other
				</span>
			</div>
			<div className="vp-viz-donuts vp-viz-tipped" ref={hostRef}>
				{rings.map((ring) => (
					// biome-ignore lint/a11y/useSemanticElements: an SVG chart with focusable marks cannot be a fieldset.
					<svg
						className="vp-viz-donut"
						key={ring.year}
						viewBox="0 0 150 150"
						width={170}
						height={170}
						role="group"
						aria-label={`Countries in ${ring.year}`}
					>
						{ring.arcs.map((arc) => (
							<path
								key={arc.code || "other"}
								d={arc.d}
								style={{
									fill: arc.code ? countryColor(arc.code) : OTHER_COLOR,
								}}
								stroke="var(--vp-surface)"
								strokeWidth={2.5}
								className="vp-viz-donut-seg"
								{...mark(`${ring.year}-${arc.code || "other"}`, {
									label: `${arc.name} · ${ring.year}`,
									value: `${formatInt(arc.count)} · ${Math.round((arc.count / ring.total) * 100)}%`,
								})}
							/>
						))}
						<text
							x={C}
							y={74}
							textAnchor="middle"
							className="vp-viz-donut-year"
						>
							{ring.year}
						</text>
						<text
							x={C}
							y={92}
							textAnchor="middle"
							className="vp-viz-donut-total"
						>
							{formatInt(ring.total)}
						</text>
					</svg>
				))}
				{tip}
			</div>
		</figure>
	);
}
