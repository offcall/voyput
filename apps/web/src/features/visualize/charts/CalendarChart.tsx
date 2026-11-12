import type { VizData } from "@voyput/core";
import { formatInt, NoData } from "./format";

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
	{ min: 0, color: "var(--vp-border)" },
	{ min: 1, color: "#9cc0f5" },
	{ min: 2, color: "#5b8def" },
	{ min: 6, color: "#2f6fc9" },
	{ min: 21, color: "#1d4b94" },
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
}: {
	year: number;
	dayCounts: Record<string, number>;
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
				fill={levelColor(count)}
			>
				<title>{`${iso} · ${count ? `${formatInt(count)} photos` : "no photos"}`}</title>
			</rect>,
		);
	}
	return (
		<div className="vp-viz-calendar-year">
			<strong>{year}</strong>
			<svg
				width={LEFT + weeks * PITCH}
				height={TOP + 7 * PITCH}
				role="img"
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

export function CalendarChart({ data }: { data: VizData }) {
	if (data.years.length === 0) return <NoData />;
	return (
		<figure className="vp-viz-figure">
			<div className="vp-viz-calendar-years">
				{data.years.map((year) => (
					<YearGrid key={year} year={Number(year)} dayCounts={data.dayCounts} />
				))}
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
