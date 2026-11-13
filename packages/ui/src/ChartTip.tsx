/**
 * Pixel tooltip of a chart mark: a dark card with a muted label and a
 * Silkscreen value, framed in the green accent. Place it inside a positioned
 * element; `x` / `y` are the point it marks, in that element's pixels.
 * Presentational only: the chart decides when to show it and puts the same
 * text in the mark's accessible name, so the tip itself is `aria-hidden`.
 */
export function ChartTip({
	label,
	value,
	x,
	y,
	below = false,
}: {
	label: string;
	value: string;
	x: number;
	y: number;
	/** Show under the point instead of above it, e.g. near the top edge. */
	below?: boolean;
}) {
	return (
		<div
			className="vp-chart-tip"
			data-below={below || undefined}
			aria-hidden="true"
			style={{ left: x, top: y }}
		>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}
