import {
	countryColor,
	type VizData,
	WORLD_HEIGHT,
	WORLD_WIDTH,
	type WorldShapes,
} from "@voyput/core";
import { useEffect, useRef } from "react";
import { NoData } from "./format";

/** Heat cell size in world-box pixels (1000 × 500). */
const CELL_PX = 6;
const RAMP: [number, [number, number, number]][] = [
	[0, [29, 78, 216]],
	[0.4, [6, 182, 212]],
	[0.65, [34, 197, 94]],
	[0.85, [250, 204, 21]],
	[1, [239, 68, 68]],
];

function rampColor(t: number): [number, number, number] {
	for (let s = 1; s < RAMP.length; s++) {
		const b = RAMP[s];
		const a = RAMP[s - 1];
		if (!a || !b || t > b[0]) continue;
		const f = (t - a[0]) / (b[0] - a[0]);
		const [r0, g0, b0] = a[1];
		const [r1, g1, b1] = b[1];
		return [
			Math.round(r0 + (r1 - r0) * f),
			Math.round(g0 + (g1 - g0) * f),
			Math.round(b0 + (b1 - b0) * f),
		];
	}
	return [239, 68, 68];
}

const RAMP_LUT = Array.from({ length: 256 }, (_, alpha) =>
	rampColor(alpha / 255),
);

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
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return; // jsdom, or a browser without canvas
	const heat = document.createElement("canvas");
	heat.width = canvas.width;
	heat.height = canvas.height;
	const hctx = heat.getContext("2d", { willReadFrequently: true });
	if (!hctx) return;
	const scale = canvas.width / WORLD_WIDTH;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (world) {
		ctx.save();
		ctx.scale(scale, scale);
		const land = new Path2D(world.landPath);
		ctx.fillStyle = "rgba(128,128,140,0.18)";
		ctx.fill(land);
		ctx.strokeStyle = "rgba(128,128,140,0.45)";
		ctx.lineWidth = 0.5;
		ctx.stroke(land);
		for (const code of codes) {
			const d = world.countryPaths[code];
			if (!d) continue;
			ctx.globalAlpha = 0.14;
			ctx.fillStyle = countryColor(code);
			ctx.fill(new Path2D(d));
		}
		ctx.restore();
	}

	const cols = Math.ceil(WORLD_WIDTH / CELL_PX);
	const max = Math.max(1, ...buckets.values());
	const radius = CELL_PX * scale * 2.1;
	hctx.globalCompositeOperation = "lighter";
	for (const [key, count] of buckets) {
		const x = ((key % cols) + 0.5) * CELL_PX * scale;
		const y = (Math.floor(key / cols) + 0.5) * CELL_PX * scale;
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
	const image = hctx.getImageData(0, 0, heat.width, heat.height);
	const px = image.data;
	for (let p = 3; p < px.length; p += 4) {
		const alpha = px[p] ?? 0;
		if (alpha === 0) continue;
		const [r, g, b] = RAMP_LUT[alpha] ?? [0, 0, 0];
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
		);
	}, [data, world]);

	if (data.heatPoints.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<canvas
				ref={ref}
				className="vp-viz-canvas"
				role="img"
				aria-label="Photo heatmap"
			/>
			<figcaption className="vp-viz-legend">
				Few photos <span className="vp-viz-ramp" /> Many photos
			</figcaption>
		</figure>
	);
}
