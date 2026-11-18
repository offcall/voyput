import type { DatedStamp } from "@voyput/core";
import { addDays } from "@voyput/core";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { useCountryColour } from "../../app/countryColours";
import type { PhotoDays } from "../../data/photoDays";
import { countryName, daysIn, flagOf, monthOf, weekdayOf } from "./format";

type Edge = "start" | "end";

/**
 * Where the photos' country changes along the strip, as `day|country` keys:
 * the first photo bar of each run of days in one country carries its flag.
 */
export function runStarts(
	days: readonly string[],
	photoDays: PhotoDays,
): Set<string> {
	const starts = new Set<string>();
	let current: string | null = null;
	for (const day of days)
		for (const { countryCode } of photoDays.get(day) ?? []) {
			if (countryCode === current) continue;
			starts.add(`${day}|${countryCode}`);
			current = countryCode;
		}
	return starts;
}

const directionMark = (s: DatedStamp) =>
	s.direction === "entry" ? "▲" : s.direction === "exit" ? "▼" : "◆";

/**
 * Days around a trip as a strip: photo countries per day, stamps under them,
 * and the stay with two handles to drag (or move with arrow keys).
 */
export function DaysTimeline({
	from,
	to,
	start,
	end,
	photoDays,
	stamps,
	linked,
	conflicted,
	onChange,
}: {
	/** First and last day shown. */
	from: string;
	to: string;
	/** The stay being edited. */
	start: string;
	end: string;
	photoDays: PhotoDays;
	/** Stamps between `from` and `to`. */
	stamps: readonly DatedStamp[];
	linked: ReadonlySet<string>;
	conflicted: ReadonlySet<string>;
	onChange: (edge: Edge, day: string) => void;
}) {
	const colorOf = useCountryColour();
	const days = daysIn(from, to);
	const n = days.length;
	const trackRef = useRef<HTMLDivElement | null>(null);
	/** The handle being dragged and the day under it; saved once, on release. */
	const [drag, setDrag] = useState<{ edge: Edge; day: string } | null>(null);
	const shownStart = drag?.edge === "start" ? drag.day : start;
	const shownEnd = drag?.edge === "end" ? drag.day : end;
	const startIdx = Math.max(0, days.indexOf(shownStart));
	const endIdx = days.includes(shownEnd) ? days.indexOf(shownEnd) : n - 1;
	const pct = (i: number) => `${(i / n) * 100}%`;
	const flagged = runStarts(days, photoDays);

	const allowed = (edge: Edge, day: string) =>
		day >= from && day <= to && (edge === "start" ? day <= end : day >= start);

	const dayAt = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return null;
		const i = Math.floor(((clientX - rect.left) / rect.width) * n);
		return days[Math.min(n - 1, Math.max(0, i))] ?? null;
	};

	const handlers = (edge: Edge) => ({
		onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			setDrag({ edge, day: edge === "start" ? start : end });
		},
		onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
			if (drag?.edge !== edge) return;
			const day = dayAt(e.clientX);
			if (day && day !== drag.day && allowed(edge, day)) setDrag({ edge, day });
		},
		// One edit per drag, however many days it crossed.
		onPointerUp: () => {
			if (drag?.edge === edge && drag.day !== (edge === "start" ? start : end))
				onChange(edge, drag.day);
			setDrag(null);
		},
		onPointerCancel: () => setDrag(null),
		onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			const step = (e.shiftKey ? 7 : 1) * (e.key === "ArrowRight" ? 1 : -1);
			const day = addDays(edge === "start" ? start : end, step);
			if (allowed(edge, day)) onChange(edge, day);
		},
	});

	return (
		<div className="vp-trips-tl" data-dragging={drag?.edge}>
			<div className="vp-trips-tl-scroll">
				<div
					className="vp-trips-tl-inner"
					style={{ minWidth: `${n * 26}px` }}
					ref={trackRef}
				>
					<div className="vp-trips-tl-months" aria-hidden="true">
						{days.map((day, i) =>
							i === 0 || day.endsWith("-01") ? (
								<span key={day} style={{ left: pct(i) }}>
									{monthOf(day)}
								</span>
							) : null,
						)}
					</div>
					<div
						className="vp-trips-tl-grid"
						style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
					>
						{days.map((day, i) => {
							const countries = photoDays.get(day) ?? [];
							const dayStamps = stamps.filter((s) => s.date === day);
							const weekday = weekdayOf(day);
							const inTrip = i >= startIdx && i <= endIdx;
							const summary = countries.length
								? countries
										.map(
											(c) =>
												`${countryName(c.countryCode)}: ${c.photos} photos`,
										)
										.join(", ")
								: "no photos";
							return (
								<div
									key={day}
									className="vp-trips-tl-day"
									data-in-trip={inTrip || undefined}
									data-weekend={
										weekday === "Sat" || weekday === "Sun" || undefined
									}
									title={`${day} · ${summary}`}
								>
									<span className="vp-trips-tl-num">
										{Number(day.slice(8))}
									</span>
									<span className="vp-trips-tl-photos">
										{countries.map((c) => (
											<span
												key={c.countryCode}
												style={{
													flexGrow: c.photos,
													background: colorOf(c.countryCode),
												}}
											>
												{flagged.has(`${day}|${c.countryCode}`) ? (
													<span className="vp-trips-tl-flag" aria-hidden="true">
														{flagOf(c.countryCode)}
													</span>
												) : null}
											</span>
										))}
									</span>
									<span className="vp-trips-tl-stamps">
										{dayStamps.map((s) => (
											<span
												key={s.id}
												className="vp-trips-tl-stamp"
												data-linked={linked.has(s.id) || undefined}
												data-conflict={conflicted.has(s.id) || undefined}
												style={{ color: colorOf(s.countryCode) }}
												title={`${s.direction} ${countryName(s.countryCode)}${s.location ? ` · ${s.location}` : ""}`}
											>
												{directionMark(s)}
											</span>
										))}
									</span>
								</div>
							);
						})}
					</div>
					<div
						className="vp-trips-tl-range"
						style={{
							left: pct(startIdx),
							width: pct(endIdx - startIdx + 1),
						}}
					>
						{(["start", "end"] as const).map((edge) => (
							<div
								key={edge}
								className="vp-trips-tl-handle"
								data-edge={edge}
								role="slider"
								tabIndex={0}
								aria-label={edge === "start" ? "Arrival" : "Departure"}
								aria-valuemin={0}
								aria-valuemax={n - 1}
								aria-valuenow={edge === "start" ? startIdx : endIdx}
								aria-valuetext={edge === "start" ? shownStart : shownEnd}
								{...handlers(edge)}
							/>
						))}
					</div>
				</div>
			</div>
			<div className="vp-trips-tl-legend">
				<span>
					<i className="vp-trips-tl-key" data-key="none" /> No photos
				</span>
				<span>▲ entry · ▼ exit</span>
				<span>
					<span className="vp-trips-tl-stamp">▲</span> Stamp of another stay
				</span>
				<span className="vp-trips-muted">
					Drag the handles or use ← → (Shift: a week) to move the arrival and
					departure; type a date to go further.
				</span>
			</div>
		</div>
	);
}
