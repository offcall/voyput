import {
	COUNTRY_CENTROIDS,
	projectEquirect,
	type VizData,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { TwinkleStars } from "@voyput/ui";
import { useMemo } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { NoData } from "./format";
import { fitView } from "./view";

interface Arc {
	key: string;
	d: string;
	color: string;
	title: string;
}

/** Quadratic arcs between country centroids for each change of country. */
function buildArcs(
	moves: VizData["moves"],
	countryColor: (code: string) => string,
): Arc[] {
	const arcs: Arc[] = [];
	moves.forEach(({ from, to }, i) => {
		const a = COUNTRY_CENTROIDS[from.code];
		const b = COUNTRY_CENTROIDS[to.code];
		if (!a || !b) return;
		const [x1, y1] = projectEquirect(a[0], a[1]);
		const [x2, y2] = projectEquirect(b[0], b[1]);
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len = Math.hypot(dx, dy);
		if (len === 0) return;
		// Bend every arc to the same side of its direction of travel.
		const [nx, ny] = dx > 0 ? [dy / len, -dx / len] : [-dy / len, dx / len];
		const h = 0.12 * len;
		const cx = (x1 + x2) / 2 + nx * h;
		const cy = (y1 + y2) / 2 + ny * h;
		arcs.push({
			key: `${i}`,
			d: `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
			color: countryColor(to.code),
			title: `${from.code} → ${to.code} · ${to.start} – ${to.end}`,
		});
	});
	return arcs;
}

export function MapChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const countryColor = useCountryColour();
	const arcs = useMemo(
		() => buildArcs(data.moves, countryColor),
		[data.moves, countryColor],
	);
	const view = useMemo(
		() => fitView(data.countries.map((c) => c.code)),
		[data.countries],
	);
	if (data.countries.length === 0) return <NoData />;
	// World-box units per screen-ish unit at this zoom, for marks of a fixed size.
	const unit = view[2] / WORLD_WIDTH;
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-sky">
				<TwinkleStars count={28} seed={11} />
				<svg
					viewBox={view.map((n) => n.toFixed(1)).join(" ")}
					role="img"
					aria-label="Route map"
					className="vp-viz-svg"
				>
					{world ? (
						<path
							d={world.landPath}
							className="vp-viz-land"
							fillRule="evenodd"
						/>
					) : null}
					{world
						? data.countries.map((country) => {
								const d = world.countryPaths[country.code];
								if (!d) return null;
								const color = countryColor(country.code);
								return (
									<path
										key={country.code}
										d={d}
										style={{ fill: color, stroke: color }}
										fillOpacity={0.55}
										strokeWidth={0.6 * unit}
										fillRule="evenodd"
									>
										<title>{country.country}</title>
									</path>
								);
							})
						: null}
					<g fill="none">
						{arcs.map((arc) => (
							<path
								key={arc.key}
								d={arc.d}
								style={{ stroke: arc.color }}
								strokeWidth={1.6 * unit}
								strokeLinecap="round"
								opacity={0.9}
							>
								<title>{arc.title}</title>
							</path>
						))}
					</g>
					<g className="vp-viz-spots" shapeRendering="crispEdges">
						{data.countries.map((country) => {
							const c = COUNTRY_CENTROIDS[country.code];
							if (!c) return null;
							const [x, y] = projectEquirect(c[0], c[1]);
							return (
								<rect
									key={country.code}
									x={x - 3 * unit}
									y={y - 3 * unit}
									width={6 * unit}
									height={6 * unit}
									strokeWidth={1.5 * unit}
								>
									<title>{country.country}</title>
								</rect>
							);
						})}
					</g>
				</svg>
			</div>
			<figcaption className="vp-viz-muted">
				Highlighted countries were visited · arcs are moves between them
			</figcaption>
		</figure>
	);
}
