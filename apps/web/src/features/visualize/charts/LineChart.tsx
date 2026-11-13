import { useEffect, useId, useRef, useState } from "react";

export interface LinePoint {
	label: string;
	value: number;
	/** Tooltip heading, unique per point; defaults to the label. */
	title?: string;
}

const HEIGHT = 220;
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const PAD = { top: 22, right: 52, bottom: 30, left: 14 };

/** 1, 2 or 5 × 10ⁿ at or above `max`, so axis labels stay round. */
function niceMax(max: number): number {
	if (max <= 0) return 1;
	const step = 10 ** Math.floor(Math.log10(max));
	for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
	return 10 * step;
}

/**
 * Monotone cubic path (Fritsch–Carlson): smooth, but never overshoots the
 * data, so a zero stays on the baseline.
 */
function smoothPath(xy: [number, number][]): string {
	const n = xy.length;
	const first = xy[0];
	if (!first) return "";
	if (n === 1) return `M${first[0]},${first[1]}`;
	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = xy[i] ?? first;
		const [x1, y1] = xy[i + 1] ?? first;
		dx.push(x1 - x0);
		slope.push((y1 - y0) / (x1 - x0 || 1));
	}
	const tangent = xy.map((_, i) => {
		if (i === 0) return slope[0] ?? 0;
		if (i === n - 1) return slope[n - 2] ?? 0;
		const a = slope[i - 1] ?? 0;
		const b = slope[i] ?? 0;
		return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
	});
	let d = `M${first[0]},${first[1]}`;
	for (let i = 0; i < n - 1; i++) {
		const [x0, y0] = xy[i] ?? first;
		const [x1, y1] = xy[i + 1] ?? first;
		const h = (dx[i] ?? 0) / 3;
		d += `C${x0 + h},${y0 + (tangent[i] ?? 0) * h} ${x1 - h},${y1 - (tangent[i + 1] ?? 0) * h} ${x1},${y1}`;
	}
	return d;
}

/** Width of the element in CSS pixels; `fallback` where ResizeObserver is missing (jsdom). */
function useWidth(fallback: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(fallback);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			const w = entry?.contentRect.width;
			if (w) setWidth(Math.round(w));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}

/**
 * Smooth green line with a gradient fill, a dot per point, the scale on the
 * right and a tooltip on hover.
 */
export function LineChart({
	points,
	label,
	format,
	showValues = false,
}: {
	points: readonly LinePoint[];
	/** Accessible name of the chart. */
	label: string;
	format: (value: number) => string;
	/** Print each value above its dot (for a handful of points), when there is room. */
	showValues?: boolean;
}) {
	const gradient = useId();
	const { ref, width } = useWidth(640);
	const [active, setActive] = useState<number | null>(null);
	const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
	const plotW = Math.max(1, width - PAD.left - PAD.right);
	const plotH = HEIGHT - PAD.top - PAD.bottom;
	const step = points.length > 1 ? plotW / (points.length - 1) : 0;
	const xy: [number, number][] = points.map((p, i) => [
		PAD.left + (points.length > 1 ? i * step : plotW / 2),
		PAD.top + plotH - (p.value / max) * plotH,
	]);
	const baseline = PAD.top + plotH;
	const line = smoothPath(xy);
	const firstX = xy[0]?.[0] ?? PAD.left;
	const lastX = xy[xy.length - 1]?.[0] ?? PAD.left;
	const area = `${line}L${lastX},${baseline}L${firstX},${baseline}Z`;
	// Room for about one label per 56 px.
	// Steps that divide a year of months, so monthly labels stay aligned.
	const need = Math.ceil((points.length * 56) / plotW);
	const every =
		[1, 2, 3, 4, 6, 12].find((n) => n >= need) ?? 12 * Math.ceil(need / 12);
	const dots = points.length <= 60;
	const tip = active === null ? null : points[active];
	const tipAt = active === null ? null : xy[active];

	return (
		<div className="vp-viz-line" ref={ref}>
			<svg
				width={width}
				height={HEIGHT}
				role="img"
				aria-label={label}
				onPointerLeave={() => setActive(null)}
			>
				<defs>
					<linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" className="vp-viz-line-fill-top" />
						<stop offset="1" className="vp-viz-line-fill-bottom" />
					</linearGradient>
				</defs>
				{[0, 0.5, 1].map((f) => {
					const y = baseline - f * plotH;
					return (
						<g key={f}>
							<line
								x1={PAD.left}
								x2={PAD.left + plotW}
								y1={y}
								y2={y}
								className="vp-viz-line-grid"
							/>
							<text
								x={width - PAD.right + 12}
								y={y}
								dominantBaseline="central"
								className="vp-viz-line-axis"
							>
								{compact.format(max * f)}
							</text>
						</g>
					);
				})}
				<line
					x1={width - PAD.right + 4}
					x2={width - PAD.right + 4}
					y1={PAD.top}
					y2={baseline}
					className="vp-viz-line-scale"
				/>
				<path d={area} fill={`url(#${gradient})`} />
				<path d={line} className="vp-viz-line-stroke" />
				{xy.map(([x, y], i) => {
					const point = points[i];
					if (!point) return null;
					return (
						<g key={point.title ?? point.label}>
							{i % every === 0 || i === points.length - 1 ? (
								<text
									x={x}
									y={HEIGHT - 8}
									textAnchor="middle"
									className="vp-viz-line-label"
								>
									{point.label}
								</text>
							) : null}
							{showValues && step >= 90 ? (
								<text
									x={x}
									y={y - 12}
									textAnchor={
										points.length > 1 && i === 0
											? "start"
											: points.length > 1 && i === points.length - 1
												? "end"
												: "middle"
									}
									className="vp-viz-line-value"
								>
									{format(point.value)}
								</text>
							) : null}
							{dots || active === i ? (
								<circle
									cx={x}
									cy={y}
									r={active === i ? 6 : points.length > 24 ? 2.5 : 4.5}
									className="vp-viz-line-dot"
								/>
							) : null}
							<rect
								x={x - Math.max(step, 12) / 2}
								y={PAD.top}
								width={Math.max(step, 12)}
								height={plotH}
								className="vp-viz-line-hit"
								onPointerEnter={() => setActive(i)}
							/>
						</g>
					);
				})}
			</svg>
			{tip && tipAt ? (
				<div
					className="vp-viz-tip"
					style={{
						left: Math.min(Math.max(tipAt[0], 60), width - 60),
						top: tipAt[1],
					}}
				>
					<span>{tip.title ?? tip.label}</span>
					<strong>{format(tip.value)}</strong>
				</div>
			) : null}
		</div>
	);
}
