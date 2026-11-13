import type { VizData } from "@voyput/core";
import { formatInt, NoData } from "./format";
import { LineChart, type LinePoint } from "./LineChart";
import { type MarkProps, type TipText, useMarkTip } from "./useMarkTip";

const CELL = 11;
const GAP = 2;
const PITCH = CELL + GAP;
const LEFT = 28;
const TOP = 16;
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const LEVELS = [
	{ min: 0, color: "var(--vp-surface-3)" },
	{
		min: 1,
		color: "color-mix(in srgb, var(--vp-accent) 30%, var(--vp-surface-3))",
	},
	{
		min: 2,
		color: "color-mix(in srgb, var(--vp-accent) 55%, var(--vp-surface-3))",
	},
	{
		min: 6,
		color: "color-mix(in srgb, var(--vp-accent) 80%, var(--vp-surface-3))",
	},
	{ min: 21, color: "var(--vp-accent-hover)" },
] as const;

function levelColor(count: number): string {
	let color: string = LEVELS[0].color;
	for (const level of LEVELS) if (count >= level.min) color = level.color;
	return color;
}

const DAY_MS = 86_400_000;

function YearGrid({
	year,
	dayCounts,
	mark,
}: {
	year: number;
	dayCounts: Record<string, number>;
	mark: (key: string, text: TipText) => MarkProps;
}) {
	const jan1 = Date.UTC(year, 0, 1);
	const offset = (new Date(jan1).getUTCDay() + 6) % 7; // Monday first
	const days = Math.round((Date.UTC(year + 1, 0, 1) - jan1) / DAY_MS);
	const weeks = Math.ceil((days + offset) / 7);
	const cells = [];
	for (let i = 0; i < days; i++) {
		const iso = new Date(jan1 + i * DAY_MS).toISOString().slice(0, 10);
		const count = dayCounts[iso] ?? 0;
		const slot = i + offset;
		cells.push(
			<rect
				key={iso}
				x={LEFT + Math.floor(slot / 7) * PITCH}
				y={TOP + (slot % 7) * PITCH}
				width={CELL}
				height={CELL}
				rx={2}
				style={{ fill: levelColor(count) }}
				{...mark(iso, {
					label: iso,
					value: count ? `${formatInt(count)} photos` : "no photos",
				})}
			/>,
		);
	}
	return (
		<div className="vp-viz-calendar-year">
			<strong className="vp-viz-year">{year}</strong>
			{/* biome-ignore lint/a11y/useSemanticElements: an SVG chart with focusable marks cannot be a fieldset. */}
			<svg
				width={LEFT + weeks * PITCH}
				height={TOP + 7 * PITCH}
				role="group"
				aria-label={`Photos per day in ${year}`}
				className="vp-viz-calendar"
			>
				{MONTHS.map((name, m) => {
					const slot =
						Math.round((Date.UTC(year, m, 1) - jan1) / DAY_MS) + offset;
					return (
						<text key={name} x={LEFT + Math.floor(slot / 7) * PITCH} y={10}>
							{name}
						</text>
					);
				})}
				{DAY_LABELS.map((label, row) =>
					label ? (
						<text key={label} x={0} y={TOP + row * PITCH + 9}>
							{label}
						</text>
					) : null,
				)}
				{cells}
			</svg>
		</div>
	);
}

/**
 * Every month from January of the first year with photos to December of the
 * last, also through years without photos; empty months are zero.
 */
export function monthPoints(data: VizData): LinePoint[] {
	const perMonth = new Map<string, number>();
	for (const [day, count] of Object.entries(data.dayCounts)) {
		const month = day.slice(0, 7);
		perMonth.set(month, (perMonth.get(month) ?? 0) + count);
	}
	const first = Number(data.years[0]);
	const last = Number(data.years[data.years.length - 1]);
	const years =
		data.years.length === 0
			? []
			: Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
	return years.flatMap((year) =>
		MONTHS.map((name, m) => {
			const key = `${year}-${String(m + 1).padStart(2, "0")}`;
			return {
				label: m === 0 ? year : name,
				title: `${name} ${year}`,
				value: perMonth.get(key) ?? 0,
			};
		}),
	);
}

export function CalendarChart({ data }: { data: VizData }) {
	const { hostRef, mark, tip } = useMarkTip();
	if (data.years.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<h3 className="vp-viz-subtitle">Photos per month</h3>
			<LineChart
				label="Photos per month"
				points={monthPoints(data)}
				format={(n) => `${formatInt(n)} photos`}
			/>
			<h3 className="vp-viz-subtitle">Photos per day</h3>
			<div className="vp-viz-calendar-years vp-viz-tipped" ref={hostRef}>
				{data.years.map((year) => (
					<YearGrid
						key={year}
						year={Number(year)}
						dayCounts={data.dayCounts}
						mark={mark}
					/>
				))}
				{tip}
			</div>
			<figcaption className="vp-viz-legend">
				Fewer
				{LEVELS.map((level) => (
					<i key={level.min} style={{ background: level.color }} />
				))}
				More photos
			</figcaption>
		</figure>
	);
}
