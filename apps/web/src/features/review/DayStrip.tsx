import { type DayRun, type Direction, dayIso, dayNumber } from "@voyput/core";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useColourOf } from "./CountryTag";
import { flagOf, formatDay } from "./format";
import {
	lineEdge,
	segmentBox,
	segmentTip,
	stripSegments,
	stripWindow,
} from "./strip";

/** Day width assumed until the strip is measured (and in tests). */
const FALLBACK_PX_PER_DAY = 16;

/** The element's width in px, kept current; 0 until measured. */
function useWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry?.contentRect.width ?? 0),
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}

/**
 * Countries by photo day around one date, one strip per stamp: a block per run of photo days, hatched days without photos, faint
 * day ticks, and a line in the exact middle on the day edge the stamp marks
 * (entry: start of the day, exit: end). `shift` slides the days under the line
 * while the strip is dragged: the line then marks the date the stamp would get.
 */
export function DayStrip({
	dayRuns,
	date,
	direction,
	stampCode,
	radius = 10,
	shift = 0,
}: {
	/** Runs of photo days; days no run covers are drawn as days without photos. */
	dayRuns: readonly DayRun[];
	date: string;
	direction: Direction;
	/** The stamp's country; its blocks are drawn stronger. */
	stampCode: string | null;
	/** Days shown on each side of the line. */
	radius?: number;
	/** Days, a fraction while dragging, that the window is moved from `date`. */
	shift?: number;
}) {
	const colourOf = useColourOf();
	const [ref, width] = useWidth<HTMLSpanElement>();
	const target = dayNumber(date);
	if (target === null) return null;
	const { from, days } = stripWindow(
		lineEdge(target, direction),
		radius,
		shift,
	);
	const first = Math.floor(from);
	const last = Math.ceil(from + days) - 1;
	const segments = stripSegments(dayRuns, first, last);
	const pxPerDay = width > 0 ? width / days : FALLBACK_PX_PER_DAY;
	const pct = (n: number) => `${n}%`;

	const centre = formatDay(dayIso(target + Math.round(shift)));
	const label = segments.every((s) => s.countryCode === null)
		? `No photo locations within ${radius} days of ${centre}`
		: `Photos around ${centre}: ${segments.map(segmentTip).join(", ")}`;
	return (
		<span ref={ref} className="review-strip" role="img" aria-label={label}>
			{segments.map((segment) => {
				const box = segmentBox(segment, from, days);
				const px = (segment.end - segment.start + 1) * pxPerDay;
				const code = segment.countryCode;
				return (
					<span
						key={segment.start}
						className="review-strip-run"
						data-empty={code === null || undefined}
						data-match={(code !== null && code === stampCode) || undefined}
						title={segmentTip(segment)}
						style={
							{
								left: pct(box.left),
								right: pct(box.right),
								"--review-country": code ? colourOf(code) : undefined,
							} as CSSProperties
						}
					>
						{code && px >= 20 ? (
							<span className="review-strip-label">
								{px >= 48 ? (
									<>
										<span aria-hidden="true">{flagOf(code)}</span>{" "}
									</>
								) : null}
								{code}
							</span>
						) : null}
					</span>
				);
			})}
			<span
				className="review-strip-ticks"
				aria-hidden="true"
				style={{
					left: pct(((first - from) / days) * 100),
					width: pct(((last - first + 1) / days) * 100),
					backgroundSize: `calc(100% / ${last - first + 1}) 100%`,
				}}
			/>
			<span className="review-strip-marker" style={{ left: "50%" }} />
		</span>
	);
}
