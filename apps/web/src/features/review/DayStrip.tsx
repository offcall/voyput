import {
	bridgeSameCountry,
	type DayRun,
	type Direction,
	dayIso,
	dayNumber,
} from "@voyput/core";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useColourOf } from "./CountryTag";
import { flagOf, formatDay } from "./format";
import {
	photoMarks,
	segmentBox,
	segmentTip,
	stripSegments,
	stripView,
	type TravelDays,
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
 * Countries by photo day around one date, one strip per stamp: a block per
 * country, joined across days without photos when no other country's photos
 * lie between, a mark under each day that has photos, hatched days unknown, faint
 * day ticks, travel days split by country, and a line in the exact middle
 * where the stamp says the border was crossed (see `stampLine`). `shift` slides the days under the line
 * while the strip is dragged: the line then marks the date the stamp would get.
 */
export function DayStrip({
	dayRuns,
	travelDays,
	date,
	direction,
	stampCode,
	radius = 10,
	shift = 0,
}: {
	/** Runs of photo days; days no run covers are drawn as days without photos. */
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
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
	const view = stripView(
		{ day: target, direction, stampCode, travelDays },
		radius,
		shift,
	);
	const { from, days } = view;
	const first = Math.floor(from);
	const last = Math.ceil(from + days) - 1;
	const segments = stripSegments(
		bridgeSameCountry(dayRuns),
		travelDays,
		first,
		last,
	);
	const pxPerDay = width > 0 ? width / days : FALLBACK_PX_PER_DAY;
	const pct = (n: number) => `${n}%`;

	const centre = formatDay(dayIso(view.day));
	const label = segments.every((s) => s.countryCode === null)
		? `No photo locations within ${radius} days of ${centre}`
		: `Photos around ${centre}: ${segments.map(segmentTip).join(", ")}`;
	return (
		<span ref={ref} className="review-strip" role="img" aria-label={label}>
			{segments.map((segment) => {
				const box = segmentBox(segment, from, days);
				const px = (segment.end - segment.start + 1) * pxPerDay;
				const code = segment.countryCode;
				if (segment.via)
					return (
						<span
							key={segment.start}
							className="review-strip-run"
							data-travel=""
							title={segmentTip(segment)}
							style={{ left: pct(box.left), right: pct(box.right) }}
						>
							{segment.via.map((part, i) => (
								<span
									// A same-day return repeats a country; the order is fixed.
									// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
									key={i}
									className="review-strip-part"
									data-match={part === stampCode || undefined}
									style={
										{
											"--review-country": colourOf(part),
										} as CSSProperties
									}
								/>
							))}
						</span>
					);
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
						{code
							? photoMarks(dayRuns, segment.start, segment.end).map((mark) => (
									<span
										key={mark.left}
										className="review-photo-mark"
										aria-hidden="true"
										style={{ left: pct(mark.left), width: pct(mark.width) }}
									/>
								))
							: null}
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
