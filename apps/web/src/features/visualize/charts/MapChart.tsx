import {
	COUNTRY_CENTROIDS,
	type MapView,
	projectEquirect,
	type VizData,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { Button, TwinkleStars } from "@voyput/ui";
import { useCallback, useMemo, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { formatInt, NoData } from "./format";
import { useMarkTip } from "./useMarkTip";
import { fitAspect, useBoxSize, usePanZoom } from "./usePanZoom";
import { fitView } from "./view";

interface Arc {
	key: string;
	d: string;
	color: string;
	label: string;
	value: string;
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
			label: `${from.country} → ${to.country}`,
			value: `${from.code} → ${to.code}`,
		});
	});
	return arcs;
}

/** Touch zooms between a city-sized view and the whole world. */
const ZOOM_LIMITS = {
	minWidth: 40,
	maxWidth: WORLD_WIDTH,
	wheel: false,
	touchOnly: true,
};

function countryTip(country: VizData["countries"][number]) {
	return {
		label: country.country,
		value: `${formatInt(country.photos)} photos`,
	};
}

export function MapChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const countryColor = useCountryColour();
	const { hostRef, mark, tip } = useMarkTip<HTMLElement>();
	const arcs = useMemo(
		() => buildArcs(data.moves, countryColor),
		[data.moves, countryColor],
	);
	// State, not a ref: a new <svg> (e.g. after an empty filter) re-attaches the hooks.
	const [svg, setSvg] = useState<SVGSVGElement | null>(null);
	const size = useBoxSize(svg);
	// A box taller than 2 : 1 (phones) gets a fit of its own shape, not sky bands.
	const aspect = size && size[1] > 0 ? size[0] / size[1] : 2;
	const fitted = useMemo(
		() =>
			fitView(
				data.countries.map((c) => c.code),
				Math.min(aspect, 2),
			),
		[data.countries, aspect],
	);
	// Touch drags and pinches move the view; new data fits it again.
	const [moved, setMoved] = useState<{ from: MapView; view: MapView } | null>(
		null,
	);
	const view = moved?.from === fitted ? moved.view : fitted;
	const onView = useCallback(
		(update: (view: MapView) => MapView) =>
			setMoved((prev) => ({
				from: fitted,
				view: update(prev?.from === fitted ? prev.view : fitted),
			})),
		[fitted],
	);
	const shown = fitAspect(view, size);
	usePanZoom(svg, shown, onView, ZOOM_LIMITS);
	if (data.countries.length === 0) return <NoData />;
	// World-box units per screen-ish unit at this zoom, for marks of a fixed size.
	const unit = view[2] / WORLD_WIDTH;
	return (
		<figure className="vp-viz-figure vp-viz-tipped vp-viz-flat" ref={hostRef}>
			<div className="vp-viz-sky">
				<TwinkleStars count={28} seed={11} />
				{/* biome-ignore lint/a11y/useSemanticElements: an SVG chart with focusable marks cannot be a fieldset. */}
				<svg
					ref={setSvg}
					viewBox={shown.map((n) => n.toFixed(1)).join(" ")}
					role="group"
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
										{...mark(`country-${country.code}`, countryTip(country))}
									/>
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
								{...mark(`move-${arc.key}`, arc)}
							/>
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
									// The country shape below has the tip; without one the spot does.
									{...(world?.countryPaths[country.code]
										? {}
										: mark(`spot-${country.code}`, countryTip(country)))}
								/>
							);
						})}
					</g>
				</svg>
				{view !== fitted ? (
					<Button
						size="sm"
						className="vp-viz-flat-fit"
						onClick={() => setMoved(null)}
					>
						Fit
					</Button>
				) : null}
			</div>
			{tip}
			<figcaption className="vp-viz-muted">
				Highlighted countries were visited · arcs are moves between them
			</figcaption>
		</figure>
	);
}
