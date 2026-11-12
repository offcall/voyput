import {
	COUNTRY_CENTROIDS,
	countryColor,
	projectEquirect,
	type VizData,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { useMemo } from "react";
import { NoData } from "./format";

interface Arc {
	key: string;
	d: string;
	color: string;
	title: string;
}

/** Quadratic arcs between country centroids for each change of country. */
function buildArcs(movements: VizData["movements"]): Arc[] {
	const arcs: Arc[] = [];
	for (let i = 1; i < movements.length; i++) {
		const prev = movements[i - 1];
		const cur = movements[i];
		if (!prev || !cur || prev.code === cur.code) continue;
		const a = COUNTRY_CENTROIDS[prev.code];
		const b = COUNTRY_CENTROIDS[cur.code];
		if (!a || !b) continue;
		const [x1, y1] = projectEquirect(a[0], a[1]);
		const [x2, y2] = projectEquirect(b[0], b[1]);
		const dx = x2 - x1;
		const dy = y2 - y1;
		const len = Math.hypot(dx, dy);
		if (len === 0) continue;
		// Bend every arc to the same side of its direction of travel.
		const [nx, ny] = dx > 0 ? [dy / len, -dx / len] : [-dy / len, dx / len];
		const h = 0.12 * len;
		const cx = (x1 + x2) / 2 + nx * h;
		const cy = (y1 + y2) / 2 + ny * h;
		arcs.push({
			key: `${i}`,
			d: `M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
			color: countryColor(cur.code),
			title: `${prev.code} → ${cur.code} · ${cur.start} – ${cur.end}`,
		});
	}
	return arcs;
}

export function MapChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const arcs = useMemo(() => buildArcs(data.movements), [data.movements]);
	if (data.countries.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<svg
				viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
				role="img"
				aria-label="Route map"
				className="vp-viz-svg"
			>
				{world ? (
					<path d={world.landPath} className="vp-viz-land" fillRule="evenodd" />
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
									fill={color}
									fillOpacity={0.25}
									stroke={color}
									strokeOpacity={0.6}
									strokeWidth={0.6}
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
							stroke={arc.color}
							strokeWidth={1.3}
							opacity={0.6}
						>
							<title>{arc.title}</title>
						</path>
					))}
				</g>
			</svg>
			<figcaption className="vp-viz-muted">
				Highlighted countries were visited · arcs are moves between them
			</figcaption>
		</figure>
	);
}
