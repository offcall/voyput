import {
	bubbleRadius,
	type CountryPalette,
	type MapView,
	pointOnRoute,
	type RevealedGroup,
	type RoutePosition,
	TRAIL_OFFSETS,
	trailPoints,
	type Waypoint,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { PixelArt, TwinkleStars } from "@voyput/ui";
import { memo, type ReactNode, useEffect, useState } from "react";
import { fitAspect, useBoxSize, usePanZoom } from "../charts/usePanZoom";

/** Narrowest and widest view the wheel and pinch zoom to, in map units. */
const ZOOM_LIMITS = { minWidth: 40, maxWidth: WORLD_WIDTH };
/** The plane sprite is 18 × 9 art pixels; drawn this many full-map units per art pixel. */
const PLANE_SCALE = 1.5;
const PLANE_W = 18;
const PLANE_H = 9;

/** Bubbles drawn larger than the core's full-map size, so they read on a fitted view. */
const BUBBLE_SCALE = 1.5;

/** Land, and the countries reached so far tinted in their colours. Redrawn only when those change. */
const MapBase = memo(function MapBase({
	world,
	reached,
	colour,
	unit,
}: {
	world: WorldShapes | null;
	reached: readonly string[];
	colour: CountryPalette;
	unit: number;
}) {
	if (!world) return null;
	return (
		<>
			<path d={world.landPath} className="vp-viz-land" fillRule="evenodd" />
			{reached.map((code) => {
				const d = world.countryPaths[code];
				if (!d) return null;
				const c = colour(code);
				return (
					<path
						key={code}
						d={d}
						style={{ fill: c, stroke: c }}
						fillOpacity={0.4}
						strokeWidth={0.5 * unit}
						fillRule="evenodd"
					/>
				);
			})}
		</>
	);
});

export interface Bubble extends RevealedGroup {
	x: number;
	y: number;
	name: string;
}

/**
 * The route on a night-sky world map: everything flown as one path, the
 * current leg, a bubble per country reached and the pixel plane with its tail.
 * Drag pans, the wheel and a pinch zoom.
 */
export function RouteMap({
	world,
	waypoints,
	position,
	heading,
	flownD,
	currentD,
	bubbles,
	reached,
	maxDays,
	colour,
	view,
	onView,
	onAspect,
	overlay,
}: {
	world: WorldShapes | null;
	waypoints: readonly Waypoint[];
	position: RoutePosition;
	/** Traveller heading in degrees, 0 = east; the sprite flips instead of flying upside down. */
	heading: number;
	flownD: string;
	currentD: string;
	bubbles: readonly Bubble[];
	/** Country codes of `bubbles`, memoised by the caller so the base map is not redrawn every frame. */
	reached: readonly string[];
	maxDays: number;
	colour: CountryPalette;
	view: MapView;
	onView: (update: (view: MapView) => MapView) => void;
	/** Called with the fit aspect (width / height, at most 2) when the map's size changes. */
	onAspect?: (aspect: number) => void;
	overlay?: ReactNode;
}) {
	// State, not a ref: a new <svg> (e.g. after an empty filter) re-attaches the hooks.
	const [svg, setSvg] = useState<SVGSVGElement | null>(null);
	// The drawn box: `view` grown to the map's own aspect (taller on a phone).
	const size = useBoxSize(svg);
	const shown = fitAspect(view, size);
	const aspect = size && size[1] > 0 ? Math.min(size[0] / size[1], 2) : 2;
	useEffect(() => onAspect?.(aspect), [onAspect, aspect]);
	usePanZoom(svg, shown, onView, ZOOM_LIMITS);
	// Map units per full-map unit: marks keep their on-screen size when zoomed.
	const unit = view[2] / WORLD_WIDTH;

	const dot = pointOnRoute(waypoints, position);
	const trail = dot ? trailPoints(waypoints, position) : [];

	return (
		<div className="vp-viz-sky vp-route-sky">
			<TwinkleStars count={36} seed={23} />
			<svg
				ref={setSvg}
				viewBox={shown.map((n) => n.toFixed(1)).join(" ")}
				role="img"
				aria-label="Route player map"
				className="vp-viz-svg vp-route-svg"
			>
				<MapBase world={world} reached={reached} colour={colour} unit={unit} />
				{flownD ? (
					<path
						d={flownD}
						className="vp-route-flown"
						strokeWidth={1.4 * unit}
					/>
				) : null}
				{currentD ? (
					<path
						d={currentD}
						className="vp-route-leg"
						strokeWidth={1.2 * unit}
						strokeDasharray={`${3 * unit} ${3 * unit}`}
					/>
				) : null}
				<g className="vp-route-bubbles">
					{bubbles.map((b) => {
						const r = bubbleRadius(b.days, maxDays) * BUBBLE_SCALE * unit;
						const c = colour(b.countryCode);
						return (
							<g key={b.countryCode} data-country={b.countryCode}>
								<circle
									cx={b.x}
									cy={b.y}
									r={r + 2.5 * unit}
									style={{ fill: c }}
									opacity={0.2}
								/>
								<circle
									cx={b.x}
									cy={b.y}
									r={r}
									style={{ fill: c }}
									fillOpacity={0.85}
									className="vp-route-bubble"
									strokeWidth={0.8 * unit}
								/>
								<title>
									{b.name} · {b.days} {b.days === 1 ? "day" : "days"} ·{" "}
									{b.visits} {b.visits === 1 ? "visit" : "visits"}
								</title>
							</g>
						);
					})}
				</g>
				{dot ? (
					<g className="vp-route-dot" shapeRendering="crispEdges">
						{trail.map(([x, y], i) => {
							const size =
								((TRAIL_OFFSETS.length - i) / TRAIL_OFFSETS.length) * 5 * unit;
							return (
								<rect
									// biome-ignore lint/suspicious/noArrayIndexKey: the tail has a fixed length.
									key={i}
									x={x - size / 2}
									y={y - size / 2}
									width={size}
									height={size}
									className="vp-route-trail"
									opacity={(1 - (i + 1) / (TRAIL_OFFSETS.length + 1)) * 0.8}
								/>
							);
						})}
						<circle
							cx={dot[0]}
							cy={dot[1]}
							r={9 * unit}
							className="vp-route-glow"
						/>
						<circle
							cx={dot[0]}
							cy={dot[1]}
							r={6 * unit}
							className="vp-route-pulse"
							strokeWidth={unit}
						/>
						<g
							className="vp-route-traveller"
							data-testid="route-dot"
							data-x={dot[0]}
							data-y={dot[1]}
							transform={`translate(${dot[0]} ${dot[1]}) rotate(${heading}) scale(${PLANE_SCALE * unit}${Math.abs(heading) > 90 ? ` ${-PLANE_SCALE * unit}` : ""}) translate(${-PLANE_W / 2} ${-PLANE_H / 2})`}
						>
							<PixelArt name="plane" scale={1} />
						</g>
					</g>
				) : null}
			</svg>
			{overlay}
		</div>
	);
}
