import type { DatedStamp } from "@voyput/core";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { useCountryColour } from "../../app/countryColours";
import { addDays, countryName, daysIn, monthOf, weekdayOf } from "./format";
import type { PhotoDays } from "./photoDays";

type Edge = "start" | "end";

const directionMark = (s: DatedStamp) =>
	s.direction === "entry" ? "▲" : s.direction === "exit" ? "▼" : "◆";

/**
 * Days around a trip as a strip: photo countries per day, stamps under them,
 * and the trip period with two handles to drag (or move with arrow keys).
 */
export function DaysTimeline({
	from,
	to,
	start,
	end,
	home,
	photoDays,
	stamps,
	linked,
	conflicted,
	onChange,
}: {
	/** First and last day shown. */
	from: string;
	to: string;
	/** Trip period being edited. */
	start: string;
	end: string;
	home: string;
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
	const [dragging, setDragging] = useState<Edge | null>(null);
	const startIdx = Math.max(0, days.indexOf(start));
	const endIdx = days.includes(end) ? days.indexOf(end) : n - 1;
	const pct = (i: number) => `${(i / n) * 100}%`;

	const move = (edge: Edge, day: string) => {
		if (day < from || day > to) return;
		if (edge === "start" && day > end) return;
		if (edge === "end" && day < start) return;
		onChange(edge, day);
	};

	const dayAt = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return null;
		const i = Math.floor(((clientX - rect.left) / rect.width) * n);
		return days[Math.min(n - 1, Math.max(0, i))] ?? null;
	};

	const handlers = (edge: Edge) => ({
		onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			setDragging(edge);
		},
		onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
			if (dragging !== edge) return;
			const day = dayAt(e.clientX);
			const current = edge === "start" ? start : end;
			if (day && day !== current) move(edge, day);
		},
		onPointerUp: () => setDragging(null),
		onPointerCancel: () => setDragging(null),
		onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			const step = (e.shiftKey ? 7 : 1) * (e.key === "ArrowRight" ? 1 : -1);
			move(edge, addDays(edge === "start" ? start : end, step));
		},
	});

	return (
		<div className="vp-trips-tl" data-dragging={dragging ?? undefined}>
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
										.map((c) => `${c.country}: ${c.photos} photos`)
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
												data-home={c.countryCode === home || undefined}
												style={{
													flexGrow: c.photos,
													background:
														c.countryCode === home
															? undefined
															: colorOf(c.countryCode),
												}}
											/>
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
								aria-label={edge === "start" ? "Trip start" : "Trip end"}
								aria-valuemin={0}
								aria-valuemax={n - 1}
								aria-valuenow={edge === "start" ? startIdx : endIdx}
								aria-valuetext={edge === "start" ? start : end}
								{...handlers(edge)}
							/>
						))}
					</div>
				</div>
			</div>
			<div className="vp-trips-tl-legend">
				<span>
					<i className="vp-trips-tl-key" data-key="home" /> Home
				</span>
				<span>
					<i className="vp-trips-tl-key" data-key="none" /> No photos
				</span>
				<span>▲ entry · ▼ exit</span>
				<span>
					<span className="vp-trips-tl-stamp">▲</span> Stamp outside the trip
				</span>
				<span className="vp-trips-muted">
					Drag the handles or use ← → (Shift: a week) to move the start and end;
					type a date to go further.
				</span>
			</div>
		</div>
	);
}
