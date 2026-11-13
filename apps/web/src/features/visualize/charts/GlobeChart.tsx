import {
	COUNTRY_CENTROIDS,
	type VizData,
	type WorldShapes,
} from "@voyput/core";
import { Button } from "@voyput/ui";
import { useEffect, useRef, useState } from "react";
import { useCanvasCountryColour } from "../../../app/countryColours";
import { NoData } from "./format";

const SIZE = 640;
const R = 240;
const TILT = 0.25;
const MAX_POINTS = 300;

type Projected = [x: number, y: number, depth: number];

function project(
	lat: number,
	lon: number,
	radius: number,
	rotY: number,
): Projected {
	const phi = (lon * Math.PI) / 180;
	const th = ((90 - lat) * Math.PI) / 180;
	const x3 = radius * Math.sin(th) * Math.cos(phi);
	const y3 = radius * Math.cos(th);
	const z3 = radius * Math.sin(th) * Math.sin(phi);
	const xr = x3 * Math.cos(rotY) + z3 * Math.sin(rotY);
	const zr = -x3 * Math.sin(rotY) + z3 * Math.cos(rotY);
	const yr = y3 * Math.cos(TILT) - zr * Math.sin(TILT);
	const depth = y3 * Math.sin(TILT) + zr * Math.cos(TILT);
	const f = 2.5 * R;
	const s = f / (f + depth);
	return [SIZE / 2 + xr * s, SIZE / 2 - yr * s, depth];
}

/** Strokes a polyline segment by segment, skipping the parts behind the globe. */
function polyline(
	ctx: CanvasRenderingContext2D,
	points: Projected[],
	minDepth: number,
) {
	ctx.beginPath();
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (!a || !b || a[2] < minDepth || b[2] < minDepth) continue;
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
	}
	ctx.stroke();
}

function drawGlobe(
	ctx: CanvasRenderingContext2D,
	data: VizData,
	world: WorldShapes | null,
	rotY: number,
	countryColor: (code: string) => string,
) {
	const p = (lat: number, lon: number, radius = R) =>
		project(lat, lon, radius, rotY);
	ctx.clearRect(0, 0, SIZE, SIZE);
	ctx.fillStyle = "rgba(128,128,140,0.12)";
	ctx.strokeStyle = "rgba(128,128,140,0.5)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.arc(SIZE / 2, SIZE / 2, R, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();

	ctx.lineWidth = 1;
	ctx.strokeStyle = "rgba(128,128,140,0.25)";
	for (let lon = -180; lon <= 180; lon += 30) {
		const line: Projected[] = [];
		for (let lat = -90; lat <= 90; lat += 5) line.push(p(lat, lon));
		polyline(ctx, line, 0);
	}
	for (let lat = -60; lat <= 60; lat += 30) {
		const line: Projected[] = [];
		for (let lon = -180; lon <= 180; lon += 5) line.push(p(lat, lon));
		polyline(ctx, line, 0);
	}

	if (world) {
		ctx.strokeStyle = "rgba(128,128,140,0.7)";
		ctx.lineWidth = 0.9;
		for (const ring of world.rings) {
			const line = ring.map(([lat, lon]) => p(lat, lon));
			const first = line[0];
			if (first) line.push(first);
			polyline(ctx, line, R * 0.03);
		}
	}

	ctx.lineWidth = 1.3;
	ctx.globalAlpha = 0.6;
	for (const { from, to } of data.moves) {
		const c1 = COUNTRY_CENTROIDS[from.code];
		const c2 = COUNTRY_CENTROIDS[to.code];
		if (!c1 || !c2) continue;
		const line: Projected[] = [];
		for (let t = 0; t <= 40; t++) {
			const f = t / 40;
			line.push(
				p(
					c1[0] + (c2[0] - c1[0]) * f,
					c1[1] + (c2[1] - c1[1]) * f,
					R * (1 + 0.18 * Math.sin(Math.PI * f)),
				),
			);
		}
		ctx.strokeStyle = countryColor(to.code);
		polyline(ctx, line, 0);
	}

	const points = data.cityPoints.slice(0, MAX_POINTS);
	const logMax = Math.log1p(Math.max(1, ...points.map((c) => c.photos)));
	ctx.globalAlpha = 0.9;
	for (const city of points) {
		const [x, y, depth] = p(city.lat, city.lon);
		if (depth < R * 0.05) continue;
		ctx.fillStyle = countryColor(city.code);
		ctx.beginPath();
		ctx.arc(x, y, 1 + (3 * Math.log1p(city.photos)) / logMax, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

/** Slowly turning globe with photo spots and moves; drag to rotate. */
export function GlobeChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const countryColor = useCanvasCountryColour();
	const ref = useRef<HTMLCanvasElement>(null);
	const [paused, setPaused] = useState(false);
	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	useEffect(() => {
		const canvas = ref.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return; // jsdom, or a browser without canvas
		const dpr = window.devicePixelRatio || 1;
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		let rotY = -Math.PI / 2;
		let dragX: number | null = null;
		let frame = 0;
		const tick = () => {
			frame = requestAnimationFrame(tick);
			if (document.hidden) return;
			if (!pausedRef.current && dragX === null) rotY += 0.0016;
			drawGlobe(ctx, data, world, rotY, countryColor);
		};
		const down = (e: PointerEvent) => {
			dragX = e.clientX;
			canvas.setPointerCapture(e.pointerId);
		};
		const move = (e: PointerEvent) => {
			if (dragX === null) return;
			rotY += (e.clientX - dragX) * 0.005;
			dragX = e.clientX;
		};
		const up = () => {
			dragX = null;
		};
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
		};
	}, [data, world, countryColor]);

	if (data.cityPoints.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure vp-viz-globe">
			<canvas
				ref={ref}
				className="vp-viz-canvas"
				role="img"
				aria-label="Globe"
			/>
			<figcaption className="vp-viz-muted">
				<Button onClick={() => setPaused((p) => !p)}>
					{paused ? "Rotate" : "Pause"}
				</Button>{" "}
				Dots are photo spots · arcs are moves · drag to turn
			</figcaption>
		</figure>
	);
}
