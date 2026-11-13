import {
	type VizData,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { TwinkleStars } from "@voyput/ui";
import { useEffect, useRef } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { channels, type Painter, usePainter } from "../themeColours";
import { NoData } from "./format";
import { type Box, fitView } from "./view";

/** Heat cell size in world-box pixels (1000 × 500). */
const CELL_PX = 6;
type Rgb = [number, number, number];

/** Heat ramp from the theme: pale sun, gold, then red for the densest spots; warm, so it stands out on the green land. */
function rampLut(paint: Painter): Rgb[] {
	const red = channels(paint("var(--vp-pixel-red)"));
	const stops: [number, Rgb][] = [
		[0, channels(paint("var(--vp-sun)"))],
		[0.45, channels(paint("var(--vp-pixel-gold)"))],
		[1, red],
	];
	return Array.from({ length: 256 }, (_, alpha) => {
		const t = alpha / 255;
		for (let s = 1; s < stops.length; s++) {
			const a = stops[s - 1];
			const b = stops[s];
			if (!a || !b || t > b[0]) continue;
			const f = (t - a[0]) / (b[0] - a[0]);
			return a[1].map((v, i) =>
				Math.round(v + ((b[1][i] ?? v) - v) * f),
			) as Rgb;
		}
		return red;
	});
}

/** Photo density grid: cell index → photo count. */
function bucketPoints(points: Float32Array): Map<number, number> {
	const cols = Math.ceil(WORLD_WIDTH / CELL_PX);
	const buckets = new Map<number, number>();
	for (let i = 0; i + 1 < points.length; i += 2) {
		const lat = points[i] ?? 0;
		const lon = points[i + 1] ?? 0;
		const gx = Math.floor((((lon + 180) / 360) * WORLD_WIDTH) / CELL_PX);
		const gy = Math.floor((((90 - lat) / 180) * WORLD_HEIGHT) / CELL_PX);
		const key = gy * cols + gx;
		buckets.set(key, (buckets.get(key) ?? 0) + 1);
	}
	return buckets;
}

function draw(
	canvas: HTMLCanvasElement,
	buckets: Map<number, number>,
	world: WorldShapes | null,
	codes: readonly string[],
	paint: Painter,
	view: Box,
	countryColor: (code: string) => string,
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return; // jsdom, or a browser without canvas
	const heat = document.createElement("canvas");
	heat.width = canvas.width;
	heat.height = canvas.height;
	const hctx = heat.getContext("2d", { willReadFrequently: true });
	if (!hctx) return;
	const [vx, vy, vw] = view;
	const scale = canvas.width / vw;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (world) {
		ctx.save();
		ctx.scale(scale, scale);
		ctx.translate(-vx, -vy);
		const land = new Path2D(world.landPath);
		ctx.fillStyle = paint("var(--vp-viz-land)");
		ctx.fill(land);
		ctx.strokeStyle = paint("var(--vp-viz-land-edge)");
		ctx.lineWidth = (0.5 * vw) / WORLD_WIDTH;
		ctx.stroke(land);
		for (const code of codes) {
			const d = world.countryPaths[code];
			if (!d) continue;
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = paint(countryColor(code));
			ctx.fill(new Path2D(d));
		}
		ctx.restore();
	}

	const cols = Math.ceil(WORLD_WIDTH / CELL_PX);
	const max = Math.max(1, ...buckets.values());
	const radius = CELL_PX * scale * 2.1;
	hctx.globalCompositeOperation = "lighter";
	for (const [key, count] of buckets) {
		const x = (((key % cols) + 0.5) * CELL_PX - vx) * scale;
		const y = ((Math.floor(key / cols) + 0.5) * CELL_PX - vy) * scale;
		const alpha = Math.min(0.85, 0.1 + 0.6 * Math.sqrt(count / max));
		const g = hctx.createRadialGradient(x, y, 0, x, y, radius);
		g.addColorStop(0, `rgba(255,255,255,${alpha})`);
		g.addColorStop(1, "rgba(255,255,255,0)");
		hctx.fillStyle = g;
		hctx.beginPath();
		hctx.arc(x, y, radius, 0, Math.PI * 2);
		hctx.fill();
	}
	// Recolour the accumulated white alpha through the ramp.
	const lut = rampLut(paint);
	const image = hctx.getImageData(0, 0, heat.width, heat.height);
	const px = image.data;
	for (let p = 3; p < px.length; p += 4) {
		const alpha = px[p] ?? 0;
		if (alpha === 0) continue;
		const [r, g, b] = lut[alpha] ?? [0, 0, 0];
		px[p - 3] = r;
		px[p - 2] = g;
		px[p - 1] = b;
	}
	hctx.putImageData(image, 0, 0);
	ctx.globalAlpha = 1;
	ctx.filter = `blur(${Math.max(1, CELL_PX * scale)}px)`;
	ctx.drawImage(heat, 0, 0);
	ctx.filter = "none";
}

export function HeatmapChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const painter = usePainter();
	const countryColor = useCountryColour();
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(WORLD_WIDTH * dpr);
		canvas.height = Math.round(WORLD_HEIGHT * dpr);
		draw(
			canvas,
			bucketPoints(data.heatPoints),
			world,
			data.countries.map((c) => c.code),
			painter(canvas.parentElement ?? document.body),
			fitView(data.countries.map((c) => c.code)),
			countryColor,
		);
	}, [data, world, painter, countryColor]);

	if (data.heatPoints.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-sky">
				<TwinkleStars count={28} seed={5} />
				<canvas
					ref={ref}
					className="vp-viz-canvas"
					role="img"
					aria-label="Photo heatmap"
				/>
			</div>
			<figcaption className="vp-viz-legend">
				Few photos <span className="vp-viz-ramp" /> Many photos
			</figcaption>
		</figure>
	);
}
