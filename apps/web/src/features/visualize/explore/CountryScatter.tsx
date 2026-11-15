import { buildCountryScatter, type CountryGroup } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { usePhone } from "../usePhone";

/** Drawing width; narrower on phones so the labels keep a readable size. */
const WIDE = 600;
const NARROW = 340;
const H = 320;
const L = 52;
const T = 16;
const R = 24;
const B = 48;
/** Tick positions; core gives the values at the same fractions. */
const STEPS = [0, 0.25, 0.5, 0.75, 1] as const;
const y = (f: number) => H - B - f * (H - T - B);

/** Countries by visits (across) and days (up); a click selects the country. */
export function CountryScatter({
	groups,
	selected,
	onPick,
}: {
	groups: readonly CountryGroup[];
	selected: string | null;
	onPick: (countryCode: string) => void;
}) {
	const colourOf = useCountryColour();
	const W = usePhone() ? NARROW : WIDE;
	const x = (f: number) => L + f * (W - L - R);
	const scatter = buildCountryScatter(groups);
	return (
		<div className="vp-viz-scroll">
			<svg
				className="vp-explore-scatter"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="Countries by visits and days"
			>
				{STEPS.map((f, i) => (
					<g key={f}>
						<line
							className="vp-viz-line-grid"
							x1={L}
							x2={W - R}
							y1={y(f)}
							y2={y(f)}
						/>
						<text
							className="vp-viz-line-axis"
							x={L - 8}
							y={y(f) + 4}
							textAnchor="end"
						>
							{scatter.dayTicks[i]}
						</text>
					</g>
				))}
				{STEPS.map((f, i) => (
					<text
						key={f}
						className="vp-viz-line-axis"
						x={x(f)}
						y={H - B + 20}
						textAnchor="middle"
					>
						{scatter.visitTicks[i]}
					</text>
				))}
				<line
					className="vp-viz-line-scale"
					x1={L}
					x2={W - R}
					y1={H - B}
					y2={H - B}
				/>
				<text
					className="vp-viz-line-label"
					x={(L + W - R) / 2}
					y={H - 8}
					textAnchor="middle"
				>
					Visits
				</text>
				<text
					className="vp-viz-line-label"
					x={14}
					y={(T + H - B) / 2}
					textAnchor="middle"
					transform={`rotate(-90 14 ${(T + H - B) / 2})`}
				>
					Days
				</text>
				{scatter.points.map((p) => (
					// biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>.
					<g
						key={p.countryCode}
						className="vp-explore-point"
						role="button"
						tabIndex={0}
						aria-label={`${p.country}: ${p.visits} visits, ${p.days} days`}
						aria-pressed={selected === p.countryCode}
						onClick={() => onPick(p.countryCode)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onPick(p.countryCode);
							}
						}}
					>
						<title>{`${p.country}: ${p.visits} visits · ${p.days} days`}</title>
						<rect
							x={x(p.x) - 6}
							y={y(p.y) - 6}
							width={12}
							height={12}
							rx={2}
							style={{ fill: colourOf(p.countryCode) }}
						/>
						{p.labelled ? (
							<text x={Math.min(W - R - 16, x(p.x) + 10)} y={y(p.y) - 8}>
								{p.countryCode}
							</text>
						) : null}
					</g>
				))}
			</svg>
		</div>
	);
}
