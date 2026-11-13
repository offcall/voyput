import type { VizData, WorldShapes } from "@voyput/core";
import { Button, ChartTip } from "@voyput/ui";
import {
	type KeyboardEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { fade, type Painter, usePainter } from "../themeColours";
import { formatInt, NoData } from "./format";
import {
	binView,
	breakLabels,
	CELL_PX,
	cellAt,
	classOf,
	type HeatGrid,
	type HeatView,
	hottestCell,
	nearestCity,
	niceBreaks,
	panBy,
	rampSlot,
	sameView,
	toWorldXY,
	viewForBox,
	zoomAt,
} from "./heatmapView";
import { fitLatLon } from "./view";
import "./heatmap.css";

/** Colour slots `--vp-heat-1` … `--vp-heat-6` in `heatmap.css`, light to hot. */
const RAMP_SLOTS = 6;
/** Canvas size before the first measure (and in tests, which have no layout). */
const FALLBACK = { width: 800, height: 400 };
const STEP = 1.6;

interface Size {
	width: number;
	height: number;
}

interface Tip {
	label: string;
	value: string;
	x: number;
	y: number;
}

function draw(
	canvas: HTMLCanvasElement,
	size: Size,
	view: HeatView,
	grid: HeatGrid,
	breaks: readonly number[],
	land: Path2D | null,
	paint: Painter,
) {
	const ctx = canvas.getContext("2d");
	if (!ctx) return; // jsdom, or a browser without canvas
	const dpr = window.devicePixelRatio || 1;
	const { width, height } = size;
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = paint("var(--vp-viz-ocean)");
	ctx.fillRect(0, 0, width, height);

	// Map base in world-box units.
	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.scale(1 / view.k, 1 / view.k);
	ctx.translate(-view.cx, -view.cy);
	ctx.lineWidth = 0.75 * view.k;
	ctx.strokeStyle = fade(paint("var(--vp-viz-land-edge)"), 0.6);
	const step = view.k < 0.12 ? 10 / 0.36 : 30 / 0.36; // 10° or 30° graticule
	ctx.beginPath();
	for (let x = 0; x <= 1000; x += step) {
		ctx.moveTo(x, 0);
		ctx.lineTo(x, 500);
	}
	for (let y = 250 % step; y <= 500; y += step) {
		ctx.moveTo(0, y);
		ctx.lineTo(1000, y);
	}
	ctx.stroke();
	if (land) {
		ctx.fillStyle = paint("var(--vp-viz-land)");
		ctx.fill(land);
		ctx.strokeStyle = paint("var(--vp-viz-land-edge)");
		ctx.stroke(land);
	}
	ctx.restore();

	// Heat: a soft glow of the squares under the crisp squares themselves.
	const ramp = Array.from({ length: RAMP_SLOTS }, (_, i) =>
		paint(`var(--vp-heat-${i + 1})`),
	);
	const colourOf = (count: number) =>
		ramp[rampSlot(classOf(count, breaks), breaks.length, RAMP_SLOTS)] ??
		"transparent";
	const glow = document.createElement("canvas");
	glow.width = grid.cols;
	glow.height = grid.rows;
	const gctx = glow.getContext("2d");
	for (let i = 0; i < grid.counts.length; i++) {
		const n = grid.counts[i] ?? 0;
		if (n === 0) continue;
		const fill = colourOf(n);
		const gx = i % grid.cols;
		const gy = Math.floor(i / grid.cols);
		if (gctx) {
			gctx.fillStyle = fill;
			gctx.fillRect(gx, gy, 1, 1);
		}
	}
	// Strong on the night map, faint on the day map, where it would muddy the land.
	const glowRgba = /^rgba\(.*,([\d.]+)\)$/.exec(
		paint("var(--vp-heat-glow)").replace(/\s/g, ""),
	);
	const glowAlpha = glowRgba ? Number(glowRgba[1]) : 1;
	ctx.save();
	ctx.imageSmoothingEnabled = true;
	for (const [blur, alpha] of [
		[CELL_PX * 3, 1],
		[CELL_PX * 3, 0.8],
		[CELL_PX, 0.7],
	] as const) {
		ctx.globalAlpha = alpha * glowAlpha;
		ctx.filter = `blur(${blur}px)`;
		ctx.drawImage(glow, 0, 0, grid.cols * CELL_PX, grid.rows * CELL_PX);
	}
	ctx.restore();
	ctx.lineWidth = 1;
	ctx.strokeStyle = fade(paint("var(--vp-viz-ocean)"), 0.55);
	for (let i = 0; i < grid.counts.length; i++) {
		const n = grid.counts[i] ?? 0;
		if (n === 0) continue;
		const x = (i % grid.cols) * CELL_PX;
		const y = Math.floor(i / grid.cols) * CELL_PX;
		ctx.fillStyle = colourOf(n);
		ctx.fillRect(x, y, CELL_PX, CELL_PX);
		ctx.strokeRect(x + 0.5, y + 0.5, CELL_PX - 1, CELL_PX - 1);
	}
}

function photos(n: number): string {
	return `${formatInt(n)} photo${n === 1 ? "" : "s"}`;
}

/**
 * Photos per square of the screen on a world map: drag to pan, wheel or pinch
 * to zoom, or use the buttons and keys. Squares stay the same size on screen,
 * so zooming in shows finer places.
 */
export function HeatmapChart({
	data,
	world,
}: {
	data: VizData;
	world: WorldShapes | null;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const hostRef = useRef<HTMLDivElement>(null);
	const hintId = useId();
	const painter = usePainter();
	const [size, setSize] = useState<Size>(FALLBACK);
	const xy = useMemo(() => toWorldXY(data.heatPoints), [data.heatPoints]);
	const fitBox = useMemo(() => fitLatLon(data.heatPoints), [data.heatPoints]);
	const fit = useMemo(
		() => viewForBox(fitBox, size.width, size.height),
		[fitBox, size],
	);
	const [view, setView] = useState<HeatView | null>(null);
	const shown = view ?? fit;
	const grid = useMemo(
		() => binView(xy, shown, size.width, size.height),
		[xy, shown, size],
	);
	const breaks = useMemo(() => niceBreaks(grid.max), [grid.max]);
	const land = useMemo(
		() =>
			world && typeof Path2D === "function" ? new Path2D(world.landPath) : null,
		[world],
	);
	const [tip, setTip] = useState<Tip | null>(null);

	// New data (e.g. another trip filter) fits the map to it again.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new points only.
	useEffect(() => {
		setView(null);
		setTip(null);
	}, [xy]);

	useEffect(() => {
		const host = hostRef.current;
		if (!host || typeof ResizeObserver !== "function") return;
		const observer = new ResizeObserver(([entry]) => {
			const box = entry?.contentRect;
			if (box && box.width > 0 && box.height > 0)
				setSize({ width: box.width, height: box.height });
		});
		observer.observe(host);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		draw(
			canvas,
			size,
			shown,
			grid,
			breaks,
			land,
			painter(canvas.parentElement ?? document.body),
		);
	}, [size, shown, grid, breaks, land, painter]);

	// Latest values for the native listeners below, which are bound once.
	const live = useRef({ shown, size });
	live.current = { shown, size };

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const pointers = new Map<number, { x: number; y: number }>();
		const local = (e: { clientX: number; clientY: number }) => {
			const r = canvas.getBoundingClientRect();
			return { x: e.clientX - r.left, y: e.clientY - r.top };
		};
		const update = (fn: (v: HeatView, s: Size) => HeatView) => {
			const { shown: v, size: s } = live.current;
			const next = fn(v, s);
			live.current = { shown: next, size: s };
			setView(next);
		};
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			const p = local(e);
			const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
			update((v, s) => zoomAt(v, factor, p.x, p.y, s.width, s.height));
		};
		const down = (e: PointerEvent) => {
			pointers.set(e.pointerId, local(e));
			canvas.setPointerCapture(e.pointerId);
			setTip(null);
		};
		const move = (e: PointerEvent) => {
			const before = pointers.get(e.pointerId);
			if (!before) return;
			const now = local(e);
			if (pointers.size === 1) {
				update((v, s) =>
					panBy(v, now.x - before.x, now.y - before.y, s.width, s.height),
				);
			} else if (pointers.size === 2) {
				const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
				if (other) {
					const d0 = Math.hypot(before.x - other.x, before.y - other.y);
					const d1 = Math.hypot(now.x - other.x, now.y - other.y);
					const mid = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
					if (d0 > 0)
						update((v, s) =>
							zoomAt(
								panBy(
									v,
									(now.x - before.x) / 2,
									(now.y - before.y) / 2,
									s.width,
									s.height,
								),
								d1 / d0,
								mid.x,
								mid.y,
								s.width,
								s.height,
							),
						);
				}
			}
			pointers.set(e.pointerId, now);
		};
		const up = (e: PointerEvent) => {
			pointers.delete(e.pointerId);
		};
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		return () => {
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
		};
	}, []);

	const tipAt = (px: number, py: number): Tip | null => {
		const cell = cellAt(grid, shown, px, py, size.width, size.height);
		if (!cell || cell.count === 0) return null;
		const city = nearestCity(
			data.cityPoints,
			cell.x,
			cell.y,
			CELL_PX * shown.k * 2,
		);
		return {
			label: city ? `${city.name}, ${city.country}` : "This square",
			value: photos(cell.count),
			x: px,
			y: py - CELL_PX / 2,
		};
	};

	const zoomBy = (factor: number) =>
		setView(
			zoomAt(
				shown,
				factor,
				size.width / 2,
				size.height / 2,
				size.width,
				size.height,
			),
		);
	const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
		const pan = Math.min(size.width, size.height) / 4;
		const moves: Record<string, () => HeatView> = {
			ArrowLeft: () => panBy(shown, pan, 0, size.width, size.height),
			ArrowRight: () => panBy(shown, -pan, 0, size.width, size.height),
			ArrowUp: () => panBy(shown, 0, pan, size.width, size.height),
			ArrowDown: () => panBy(shown, 0, -pan, size.width, size.height),
		};
		const zooms: Record<string, number> = {
			"+": STEP,
			"=": STEP,
			"-": 1 / STEP,
		};
		const move = moves[event.key];
		const zoom = zooms[event.key];
		if (move) setView(move());
		else if (zoom) zoomBy(zoom);
		else if (event.key === "0") setView(null);
		else return;
		event.preventDefault();
		setTip(null);
	};
	const showHottest = () => {
		const hot = hottestCell(grid);
		setTip(hot ? tipAt(hot.px, hot.py) : null);
	};

	if (data.heatPoints.length === 0) return <NoData />;
	const labels = breakLabels(breaks);
	const atFit = sameView(shown, fit);
	return (
		<figure className="vp-viz-figure vp-heat">
			<div className="vp-heat-map" ref={hostRef}>
				<canvas
					ref={canvasRef}
					className="vp-heat-canvas"
					role="img"
					aria-label="Photo heatmap"
					aria-describedby={hintId}
					tabIndex={0}
					onPointerMove={(e) => {
						if (e.buttons !== 0) return;
						const r = e.currentTarget.getBoundingClientRect();
						setTip(tipAt(e.clientX - r.left, e.clientY - r.top));
					}}
					onPointerLeave={() => setTip(null)}
					onFocus={showHottest}
					onBlur={() => setTip(null)}
					onKeyDown={onKeyDown}
				/>
				{tip ? (
					<ChartTip
						label={tip.label}
						value={tip.value}
						x={Math.min(Math.max(tip.x, 70), size.width - 70)}
						y={tip.y}
						below={tip.y < 56}
					/>
				) : null}
				<div className="vp-heat-zoom">
					<Button
						size="sm"
						square
						aria-label="Zoom in"
						onClick={() => zoomBy(STEP)}
					>
						+
					</Button>
					<Button
						size="sm"
						square
						aria-label="Zoom out"
						onClick={() => zoomBy(1 / STEP)}
					>
						−
					</Button>
					<Button
						size="sm"
						aria-label="Fit to photos"
						disabled={atFit}
						onClick={() => setView(null)}
					>
						Fit
					</Button>
				</div>
			</div>
			<figcaption className="vp-heat-caption">
				<div className="vp-heat-legend">
					<span className="vp-heat-legend-title">Photos per square</span>
					<ol>
						{labels.map((label, i) => (
							<li key={label}>
								<i
									style={{
										background: `var(--vp-heat-${rampSlot(i, labels.length, RAMP_SLOTS) + 1})`,
									}}
								/>
								{label}
							</li>
						))}
					</ol>
				</div>
				<p id={hintId} className="vp-heat-hint">
					Drag to pan · scroll, pinch or +/− to zoom · 0 fits
				</p>
			</figcaption>
		</figure>
	);
}
