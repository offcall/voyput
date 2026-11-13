import { type DayRun, type Direction, dayIso, dayNumber } from "@voyput/core";
import { Button } from "@voyput/ui";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { DayStrip } from "./DayStrip";
import { formatDay } from "./format";
import { lineEdge, stripWindow } from "./strip";
import { dragShift, snapShift } from "./stripPan";

/**
 * A `DayStrip` that sets the stamp date: drag it
 * (mouse, pen or touch) and the days slide under the date line like a map, so
 * dragging right picks an earlier date; on release it lands on a whole day.
 * Arrow keys and the ‹ › buttons move the date a day (Shift: a week); reset
 * returns to the date as read.
 */
export function PannableDayStrip({
	dayRuns,
	date,
	readDate,
	direction,
	stampCode,
	radius,
	onDate,
}: {
	dayRuns: readonly DayRun[];
	date: string;
	/** The date as read from the stamp, where reset returns to. */
	readDate: string | null;
	/** Puts the line at the start (entry) or end (exit) of the stamp day. */
	direction: Direction;
	stampCode: string | null;
	radius: number;
	/** Saves a new stamp date. */
	onDate: (date: string) => void;
}) {
	/** Days moved from `date`, a fraction while dragging; null at rest. */
	const [moving, setMoving] = useState<number | null>(null);
	/** A day sent with `onDate` while `date` was still `base`; it counts until `date` changes. */
	const [pending, setPending] = useState<{ base: string; day: number } | null>(
		null,
	);
	const drag = useRef<{
		pointerId: number;
		startX: number;
		pxPerDay: number;
		last: number;
	} | null>(null);

	const saved = dayNumber(date);
	if (saved === null) return null;
	const target = pending?.base === date ? pending.day : saved;
	const total = radius * 2;
	const read = readDate ? dayNumber(readDate) : null;

	const moveTo = (day: number) => {
		if (day === target) return;
		setPending({ base: date, day });
		onDate(dayIso(day));
	};

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		drag.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			pxPerDay: event.currentTarget.getBoundingClientRect().width / total,
			last: 0,
		};
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// No capture (jsdom, or the pointer is already gone): moves still arrive while over the strip.
		}
		setMoving(0);
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		current.last = dragShift(
			0,
			event.clientX - current.startX,
			current.pxPerDay,
		);
		setMoving(current.last);
	};
	const endDrag = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		drag.current = null;
		setMoving(null);
		moveTo(target + snapShift(current.last));
	};
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.shiftKey ? 7 : 1;
		if (event.key === "ArrowLeft") moveTo(target - step);
		else if (event.key === "ArrowRight") moveTo(target + step);
		else if (event.key === "Home" && read !== null) moveTo(read);
		else return;
		event.preventDefault();
	};

	/** The day under the date line, while dragging too. */
	const centre = target + Math.round(moving ?? 0);
	const shown = formatDay(dayIso(centre));
	/** First and last whole day shown at rest; the line is on the edge between the halves. */
	const view = stripWindow(lineEdge(centre, direction), radius);
	return (
		<div className="review-pan">
			<div className="review-pan-row">
				<Button
					variant="ghost"
					size="sm"
					square
					aria-label="One day earlier"
					onClick={() => moveTo(target - 1)}
				>
					‹
				</Button>
				<div
					className="review-pan-track"
					role="slider"
					tabIndex={0}
					aria-label="Stamp date on the photo location history"
					aria-orientation="horizontal"
					aria-valuemin={-36500}
					aria-valuemax={36500}
					aria-valuenow={target - (read ?? saved)}
					aria-valuetext={shown}
					data-dragging={moving === null ? undefined : ""}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					onKeyDown={onKeyDown}
				>
					<DayStrip
						dayRuns={dayRuns}
						date={dayIso(target)}
						direction={direction}
						stampCode={stampCode}
						radius={radius}
						shift={moving ?? 0}
					/>
				</div>
				<Button
					variant="ghost"
					size="sm"
					square
					aria-label="One day later"
					onClick={() => moveTo(target + 1)}
				>
					›
				</Button>
			</div>
			<div className="review-pan-meta">
				<span>{formatDay(dayIso(view.from))}</span>
				<span className="review-pan-date">
					{shown}
					<span className="review-pan-edge">
						{direction === "exit" ? " · end of day" : " · start of day"}
					</span>
				</span>
				<span>{formatDay(dayIso(view.from + view.days - 1))}</span>
			</div>
			{read !== null && read !== target ? (
				<div className="review-pan-reset">
					<span>Read as {formatDay(dayIso(read))}</span>
					<Button variant="ghost" size="sm" onClick={() => moveTo(read)}>
						Reset to read date
					</Button>
				</div>
			) : null}
		</div>
	);
}
