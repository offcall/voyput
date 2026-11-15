import {
	type CityPoint,
	COUNTRY_CENTROIDS,
	type VizData,
	type WorldShapes,
} from "@voyput/core";
import { Button, ChartTip, TwinkleStars } from "@voyput/ui";
import {
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { useCountryColour } from "../../../app/countryColours";
import { fade, type Painter, usePainter } from "../themeColours";
import { formatInt, NoData } from "./format";
import {
	clampTilt,
	type GlobeView,
	greatCircle,
	inRing,
	invert,
	project,
	ringsFromPath,
	wrapLon,
} from "./globeProjection";
import { placeName } from "./heatmapView";
import "./globe.css";

const SIZE = 640;
const R = 250;
const MAX_POINTS = 300;
/** Auto-rotation, degrees of longitude per frame (about 5° a second). */
const SPIN = 0.09;
/** Velocity kept per frame after a drag is let go. */
const FRICTION = 0.94;
/** Fastest spin a drag can leave behind, degrees per frame. */
const MAX_FLING = 4;
/** A touch that moves less than this many canvas pixels is a tap, not a turn. */
const TAP_SLOP = 12;
/** Picks a photo spot within this many canvas pixels of the pointer. */
const HIT_PX = 9;

type Ring = [number, number][];

interface VisitedCountry {
	code: string;
	name: string;
	photos: number;
	rings: Ring[];
	/** Where the globe turns to when the country is picked with the keyboard. */
	centre: [number, number];
}

interface Scene {
	land: Ring[];
	countries: VisitedCountry[];
	arcs: { code: string; points: [number, number, number][] }[];
	cities: CityPoint[];
	logMax: number;
}

type Hover =
	| { kind: "country"; country: VisitedCountry }
	| { kind: "city"; city: CityPoint };

interface Tip {
	label: string;
	value: string;
	/** Canvas pixels of the point the tip marks. */
	x: number;
	y: number;
}

function ringCentre(rings: readonly Ring[]): [number, number] | null {
	let biggest: Ring | undefined;
	for (const ring of rings)
		if (!biggest || ring.length > biggest.length) biggest = ring;
	if (!biggest?.length) return null;
	let lat = 0;
	let lon = 0;
	for (const [a, b] of biggest) {
		lat += a;
		lon += b;
	}
	return [lat / biggest.length, lon / biggest.length];
}

function buildScene(data: VizData, world: WorldShapes | null): Scene {
	const countries: VisitedCountry[] = [];
	for (const stat of data.countries) {
		const path = world?.countryPaths[stat.code];
		const rings = path ? ringsFromPath(path) : [];
		const centre = COUNTRY_CENTROIDS[stat.code] ?? ringCentre(rings);
		if (!centre) continue;
		countries.push({
			code: stat.code,
			name: stat.country,
			photos: stat.photos,
			rings,
			centre: [centre[0], centre[1]],
		});
	}
	const arcs: Scene["arcs"] = [];
	for (const { from, to } of data.moves) {
		const a = COUNTRY_CENTROIDS[from.code];
		const b = COUNTRY_CENTROIDS[to.code];
		if (!a || !b || from.code === to.code) continue;
		const points: [number, number, number][] = [];
		for (let t = 0; t <= 32; t++) {
			const f = t / 32;
			const [lat, lon] = greatCircle(a, b, f);
			points.push([lat, lon, 1 + 0.12 * Math.sin(Math.PI * f)]);
		}
		arcs.push({ code: to.code, points });
	}
	const cities = data.cityPoints.slice(0, MAX_POINTS);
	return {
		land: world ? ringsFromPath(world.landPath) : [],
		countries,
		arcs,
		cities,
		logMax: Math.log1p(Math.max(1, ...cities.map((c) => c.photos))),
	};
}

/** Starting view: the photo-weighted middle of the spots, tilted at most 35°. */
function startView(cities: readonly CityPoint[]): GlobeView {
	let x = 0;
	let y = 0;
	let z = 0;
	for (const c of cities) {
		const lat = (c.lat * Math.PI) / 180;
		const lon = (c.lon * Math.PI) / 180;
		x += c.photos * Math.cos(lat) * Math.cos(lon);
		y += c.photos * Math.cos(lat) * Math.sin(lon);
		z += c.photos * Math.sin(lat);
	}
	if (x === 0 && y === 0 && z === 0) return { lat: 20, lon: 10 };
	const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
	return {
		lat: Math.min(Math.max(lat, -35), 35),
		lon: (Math.atan2(y, x) * 180) / Math.PI,
	};
}

function cityRadius(city: CityPoint, logMax: number): number {
	return 2.2 + (3.4 * Math.log1p(city.photos)) / logMax;
}

/** Traces a ring; points behind the globe are pulled onto its edge so fills stay closed. */
function traceRing(
	ctx: CanvasRenderingContext2D,
	ring: readonly [number, number][],
	view: GlobeView,
): boolean {
	let seen = false;
	ring.forEach(([lat, lon], i) => {
		let [x, y, front] = project(lat, lon, view, R);
		if (front > 0) seen = true;
		else {
			const d = Math.hypot(x, y) || 1;
			x = (x / d) * R;
			y = (y / d) * R;
		}
		if (i === 0) ctx.moveTo(SIZE / 2 + x, SIZE / 2 + y);
		else ctx.lineTo(SIZE / 2 + x, SIZE / 2 + y);
	});
	ctx.closePath();
	return seen;
}

/** Strokes the near-side parts of a `[lat, lon]` line. */
function strokeNear(
	ctx: CanvasRenderingContext2D,
	line: readonly [number, number][],
	view: GlobeView,
	closed = false,
) {
	let prev: [number, number, number] | null = null;
	const points = closed && line[0] ? [...line, line[0]] : line;
	for (const [lat, lon] of points) {
		const [x, y, front] = project(lat, lon, view, R);
		if (prev && prev[2] > 0 && front > 0) {
			ctx.moveTo(SIZE / 2 + prev[0], SIZE / 2 + prev[1]);
			ctx.lineTo(SIZE / 2 + x, SIZE / 2 + y);
		}
		prev = [x, y, front];
	}
}

function drawGlobe(
	ctx: CanvasRenderingContext2D,
	scene: Scene,
	view: GlobeView,
	paint: Painter,
	countryColor: (code: string) => string,
	hover: Hover | null,
) {
	const c = SIZE / 2;
	ctx.clearRect(0, 0, SIZE, SIZE);

	// Atmosphere: a soft halo just outside the rim.
	const air = ctx.createRadialGradient(c, c, R * 0.96, c, c, R * 1.16);
	air.addColorStop(0, paint("var(--vp-globe-air)"));
	air.addColorStop(1, fade(paint("var(--vp-globe-air)"), 0));
	ctx.fillStyle = air;
	ctx.beginPath();
	ctx.arc(c, c, R * 1.16, 0, Math.PI * 2);
	ctx.fill();

	const ocean = ctx.createRadialGradient(
		c - R * 0.35,
		c - R * 0.4,
		R * 0.05,
		c,
		c,
		R,
	);
	ocean.addColorStop(0, paint("var(--vp-viz-ocean-light)"));
	ocean.addColorStop(1, paint("var(--vp-viz-ocean)"));
	ctx.fillStyle = ocean;
	ctx.beginPath();
	ctx.arc(c, c, R, 0, Math.PI * 2);
	ctx.fill();

	ctx.save();
	ctx.clip();
	ctx.lineWidth = 0.8;
	ctx.strokeStyle = fade(paint("var(--vp-globe-grid)"), 0.5);
	ctx.beginPath();
	for (let lon = -180; lon < 180; lon += 15) {
		const line: [number, number][] = [];
		for (let lat = -75; lat <= 75; lat += 3) line.push([lat, lon]);
		strokeNear(ctx, line, view);
	}
	for (let lat = -75; lat <= 75; lat += 15) {
		const line: [number, number][] = [];
		for (let lon = -180; lon <= 180; lon += 3) line.push([lat, lon]);
		strokeNear(ctx, line, view);
	}
	ctx.stroke();

	ctx.fillStyle = paint("var(--vp-viz-land)");
	for (const ring of scene.land) {
		ctx.beginPath();
		if (traceRing(ctx, ring, view)) ctx.fill();
	}
	ctx.lineWidth = 0.7;
	ctx.strokeStyle = paint("var(--vp-viz-land-edge)");
	ctx.beginPath();
	for (const ring of scene.land) strokeNear(ctx, ring, view, true);
	ctx.stroke();

	for (const country of scene.countries) {
		const colour = paint(countryColor(country.code));
		ctx.fillStyle = fade(colour, 0.85);
		for (const ring of country.rings) {
			ctx.beginPath();
			if (traceRing(ctx, ring, view)) ctx.fill();
		}
	}
	ctx.lineWidth = 0.9;
	ctx.strokeStyle = fade(paint("var(--vp-globe-edge)"), 0.7);
	ctx.beginPath();
	for (const country of scene.countries)
		for (const ring of country.rings) strokeNear(ctx, ring, view, true);
	ctx.stroke();
	if (hover?.kind === "country") {
		ctx.lineWidth = 2;
		ctx.strokeStyle = paint("var(--vp-text)");
		ctx.beginPath();
		for (const ring of hover.country.rings) strokeNear(ctx, ring, view, true);
		ctx.stroke();
	}

	// Night side shading towards the rim, for depth.
	const shade = ctx.createRadialGradient(
		c - R * 0.3,
		c - R * 0.35,
		R * 0.3,
		c,
		c,
		R,
	);
	shade.addColorStop(0, fade(paint("var(--vp-globe-shade)"), 0));
	shade.addColorStop(1, paint("var(--vp-globe-shade)"));
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, SIZE, SIZE);
	ctx.restore();

	ctx.lineWidth = 1.5;
	ctx.strokeStyle = fade(paint("var(--vp-accent)"), 0.6);
	ctx.beginPath();
	ctx.arc(c, c, R, 0, Math.PI * 2);
	ctx.stroke();

	// Moves: great-circle arcs lifted off the surface; hidden where the globe is in front.
	ctx.lineWidth = 1.8;
	ctx.lineCap = "round";
	for (const arc of scene.arcs) {
		ctx.strokeStyle = fade(paint(countryColor(arc.code)), 0.9);
		ctx.beginPath();
		let prev: [number, number, boolean] | null = null;
		for (const [lat, lon, lift] of arc.points) {
			const [x, y, front] = project(lat, lon, view, R);
			const sx = x * lift;
			const sy = y * lift;
			const shown = front > 0 || Math.hypot(sx, sy) > R;
			if (prev?.[2] && shown) {
				ctx.moveTo(c + prev[0], c + prev[1]);
				ctx.lineTo(c + sx, c + sy);
			}
			prev = [sx, sy, shown];
		}
		ctx.stroke();
	}

	ctx.lineWidth = 0.8;
	ctx.strokeStyle = paint("var(--vp-globe-edge)");
	for (const city of scene.cities) {
		const [x, y, front] = project(city.lat, city.lon, view, R);
		if (front < 0.05) continue;
		ctx.fillStyle = paint(countryColor(city.code));
		ctx.beginPath();
		ctx.arc(
			c + x,
			c + y,
			cityRadius(city, scene.logMax) *
				(hover?.kind === "city" && hover.city === city ? 1.6 : 1),
			0,
			Math.PI * 2,
		);
		ctx.fill();
		ctx.stroke();
	}
}

/** What is under canvas pixel `px`, `py`: a photo spot first, else a visited country. */
function hitTest(
	scene: Scene,
	view: GlobeView,
	px: number,
	py: number,
): Hover | null {
	const x = px - SIZE / 2;
	const y = py - SIZE / 2;
	let best: CityPoint | null = null;
	let bestD = HIT_PX ** 2;
	for (const city of scene.cities) {
		const [cx, cy, front] = project(city.lat, city.lon, view, R);
		if (front < 0.05) continue;
		const d = (cx - x) ** 2 + (cy - y) ** 2;
		if (d < bestD) {
			bestD = d;
			best = city;
		}
	}
	if (best) return { kind: "city", city: best };
	const at = invert(x, y, view, R);
	if (!at) return null;
	const country = scene.countries.find((c) =>
		c.rings.some((ring) => inRing(at[0], at[1], ring)),
	);
	return country ? { kind: "country", country } : null;
}

function hoverKey(hover: Hover | null): string {
	if (!hover) return "";
	return hover.kind === "city"
		? `city:${hover.city.lat},${hover.city.lon},${hover.city.name}`
		: `country:${hover.country.code}`;
}

function photos(n: number): string {
	return `${formatInt(n)} photo${n === 1 ? "" : "s"}`;
}

function tipFor(hover: Hover, view: GlobeView): Tip {
	if (hover.kind === "city") {
		const [x, y] = project(hover.city.lat, hover.city.lon, view, R);
		return {
			label: placeName(hover.city),
			value: photos(hover.city.photos),
			x: SIZE / 2 + x,
			y: SIZE / 2 + y - 6,
		};
	}
	const [lat, lon] = hover.country.centre;
	const [x, y] = project(lat, lon, view, R);
	return {
		label: hover.country.name,
		value: photos(hover.country.photos),
		x: SIZE / 2 + x,
		y: SIZE / 2 + y,
	};
}

function prefersReducedMotion(): boolean {
	return (
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Turning globe with visited countries in their colours, photo spots and
 * moves. Drag to turn (it keeps spinning a little after letting go); hover or
 * ←/→ shows a country. Rotation pauses while hovered, dragged or picked.
 */
export function GlobeChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const skyRef = useRef<HTMLDivElement>(null);
	const [paused, setPaused] = useState(prefersReducedMotion);
	const [tip, setTip] = useState<Tip | null>(null);
	const hintId = useId();
	/** The country picked by keyboard, read out; the tip itself is `aria-hidden`. */
	const [spoken, setSpoken] = useState("");
	const painter = usePainter();
	const countryColor = useCountryColour();
	const scene = useMemo(() => buildScene(data, world), [data, world]);
	const pausedRef = useRef(paused);
	pausedRef.current = paused;
	// These outlive the draw effect, so a theme change or new data keeps the angle.
	const view = useRef<GlobeView | null>(null);
	const velocity = useRef({ lon: 0, lat: 0 });
	const hover = useRef<Hover | null>(null);
	const picked = useRef<{ index: number; target: GlobeView } | null>(null);
	view.current ??= startView(scene.cities);

	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return; // jsdom, or a browser without canvas
		const dpr = window.devicePixelRatio || 1;
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const paint = painter(canvas.parentElement ?? document.body);

		let drag: { x: number; y: number; t: number } | null = null;
		let inside = false;
		let visible = true;
		let dirty = true;
		const observer =
			typeof IntersectionObserver === "function"
				? new IntersectionObserver(([entry]) => {
						visible = entry?.isIntersecting ?? true;
					})
				: null;
		observer?.observe(canvas);

		const scale = () => SIZE / (canvas.getBoundingClientRect().width || SIZE);
		const local = (e: PointerEvent): [number, number] => {
			const r = canvas.getBoundingClientRect();
			const s = scale();
			return [(e.clientX - r.left) * s, (e.clientY - r.top) * s];
		};
		const showHover = (next: Hover | null) => {
			hover.current = next;
			dirty = true;
			const v = view.current;
			setTip(next && v ? tipFor(next, v) : null);
		};

		let frame = 0;
		const tick = () => {
			frame = requestAnimationFrame(tick);
			if (document.hidden || !visible) return;
			const v = view.current;
			if (!v) return;
			const pick = picked.current;
			const vel = velocity.current;
			if (pick) {
				const dLon = wrapLon(pick.target.lon - v.lon);
				const dLat = pick.target.lat - v.lat;
				if (Math.abs(dLon) + Math.abs(dLat) > 0.05) {
					v.lon = wrapLon(v.lon + dLon * 0.12);
					v.lat = clampTilt(v.lat + dLat * 0.12);
					dirty = true;
				}
			} else if (drag === null && (vel.lon !== 0 || vel.lat !== 0)) {
				v.lon = wrapLon(v.lon + vel.lon);
				v.lat = clampTilt(v.lat + vel.lat);
				vel.lon *= FRICTION;
				vel.lat *= FRICTION;
				if (Math.abs(vel.lon) + Math.abs(vel.lat) < 0.005) {
					vel.lon = 0;
					vel.lat = 0;
				}
				dirty = true;
			} else if (!pausedRef.current && drag === null && !inside) {
				v.lon = wrapLon(v.lon - SPIN);
				dirty = true;
			}
			if (!dirty) return;
			dirty = false;
			drawGlobe(ctx, scene, v, paint, countryColor, hover.current);
		};
		// Where a touch went down: lifting it close by is a tap that shows a tip.
		let pressed: [number, number] | null = null;
		const down = (e: PointerEvent) => {
			const [x, y] = local(e);
			pressed = e.pointerType === "mouse" ? null : [x, y];
			drag = { x, y, t: e.timeStamp };
			velocity.current = { lon: 0, lat: 0 };
			picked.current = null;
			canvas.setPointerCapture(e.pointerId);
			showHover(null);
		};
		const move = (e: PointerEvent) => {
			const v = view.current;
			if (!v) return;
			const [x, y] = local(e);
			if (drag === null) {
				if (e.pointerType === "mouse") {
					const next = hitTest(scene, v, x, y);
					if (hoverKey(next) !== hoverKey(hover.current)) showHover(next);
				}
				return;
			}
			const perPx = 180 / Math.PI / R;
			const dLon = -(x - drag.x) * perPx;
			const dLat = (y - drag.y) * perPx;
			// Degrees per frame of the last move, capped so one jerk is not a wild fling.
			const frames = Math.max(16.7, e.timeStamp - drag.t) / 16.7;
			const fling = (d: number) =>
				Math.min(Math.max(d / frames, -MAX_FLING), MAX_FLING);
			v.lon = wrapLon(v.lon + dLon);
			v.lat = clampTilt(v.lat + dLat);
			velocity.current = { lon: fling(dLon), lat: fling(dLat) };
			drag = { x, y, t: e.timeStamp };
			dirty = true;
		};
		const up = (e: PointerEvent) => {
			// A pause before letting go means no fling.
			if (drag && e.timeStamp - drag.t > 80)
				velocity.current = { lon: 0, lat: 0 };
			drag = null;
			const v = view.current;
			if (pressed && v && e.type === "pointerup") {
				const [x, y] = local(e);
				if (Math.hypot(x - pressed[0], y - pressed[1]) < TAP_SLOP)
					showHover(hitTest(scene, v, x, y));
			}
			pressed = null;
		};
		const enter = () => {
			inside = true;
		};
		const leave = (e: PointerEvent) => {
			inside = false;
			// A finger leaves as it lifts; a tapped tip stays until the next tap.
			if (drag === null && e.pointerType !== "touch") showHover(null);
		};
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		canvas.addEventListener("pointerenter", enter);
		canvas.addEventListener("pointerleave", leave);
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			observer?.disconnect();
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			canvas.removeEventListener("pointerenter", enter);
			canvas.removeEventListener("pointerleave", leave);
		};
	}, [scene, painter, countryColor]);

	/** ←/→ turn to the previous/next visited country and name it; Escape lets go. */
	const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
		const count = scene.countries.length;
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
			event.key
		];
		if (event.key === "Escape") {
			picked.current = null;
			hover.current = null;
			setTip(null);
			setSpoken("");
			return;
		}
		if (step === undefined || count === 0) return;
		event.preventDefault();
		const at = picked.current
			? (picked.current.index + step + count) % count
			: step > 0
				? 0
				: count - 1;
		const country = scene.countries[at];
		if (!country) return;
		const target = {
			lat: clampTilt(country.centre[0]),
			lon: country.centre[1],
		};
		picked.current = { index: at, target };
		velocity.current = { lon: 0, lat: 0 };
		hover.current = { kind: "country", country };
		setTip({
			label: country.name,
			value: photos(country.photos),
			x: SIZE / 2,
			y: SIZE / 2,
		});
		setSpoken(`${country.name}: ${photos(country.photos)}`);
	};

	// Canvas pixels → pixels of the sky box the tip is placed in.
	const tipBox = (() => {
		const canvas = ref.current;
		const sky = skyRef.current;
		if (!tip || !canvas || !sky) return null;
		const c = canvas.getBoundingClientRect();
		const s = sky.getBoundingClientRect();
		const k = c.width / SIZE || 1;
		return {
			x: c.left - s.left + tip.x * k,
			y: c.top - s.top + tip.y * k,
		};
	})();

	if (data.cityPoints.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure vp-viz-globe vp-globe">
			<div className="vp-viz-sky" ref={skyRef}>
				<TwinkleStars count={36} seed={3} />
				<canvas
					ref={ref}
					className="vp-viz-canvas"
					role="img"
					aria-label="Globe"
					aria-describedby={hintId}
					tabIndex={0}
					onKeyDown={onKeyDown}
					onBlur={() => {
						picked.current = null;
						hover.current = null;
						setTip(null);
						setSpoken("");
					}}
				/>
				<p className="vp-visually-hidden" aria-live="polite">
					{spoken}
				</p>
				{tip && tipBox ? (
					<ChartTip
						label={tip.label}
						value={tip.value}
						x={tipBox.x}
						y={tipBox.y}
						below={tipBox.y < 56}
					/>
				) : null}
			</div>
			<figcaption className="vp-viz-caption">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => setPaused((p) => !p)}
				>
					{paused ? "Rotate" : "Pause"}
				</Button>{" "}
				<span id={hintId}>
					Drag to turn · hover or tap a country or spot · ←/→ steps through
					countries
				</span>
			</figcaption>
		</figure>
	);
}
