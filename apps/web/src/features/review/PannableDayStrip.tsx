import { type DayRun, dayIso, dayNumber } from "@voyput/core";
import { Button } from "@voyput/ui";
import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { DayStrip } from "./DayStrip";
import { plural } from "./format";
import { dragShift, snapShift } from "./stripPan";

const SNAP_MS = 140;

/** True only where the browser says the user is fine with motion. */
const animates = (): boolean =>
	typeof window.matchMedia === "function" &&
	window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

/**
 * A `DayStrip` the user can pan through time: drag it (mouse, pen or touch),
 * use the arrow keys or the ‹ › buttons. At rest the window always starts on a
 * whole day; a drag snaps to the nearest one on release.
 */
export function PannableDayStrip({
	dayRuns,
	date,
	stampCode,
	radius,
}: {
	dayRuns: readonly DayRun[];
	date: string;
	stampCode: string | null;
	radius: number;
}) {
	/** Whole days from the stamp date, at rest. */
	const [shift, setShift] = useState(0);
	/** A fractional shift while dragging or snapping; null at rest. */
	const [moving, setMoving] = useState<number | null>(null);
	const drag = useRef<{
		pointerId: number;
		startX: number;
		startShift: number;
		pxPerDay: number;
		last: number;
	} | null>(null);
	const frame = useRef(0);
	useEffect(() => () => cancelAnimationFrame(frame.current), []);

	const target = dayNumber(date);
	if (target === null) return null;
	const total = radius * 2 + 1;

	/** Rests on `to`, easing there from `from` unless motion is reduced. */
	const settle = (from: number, to: number) => {
		cancelAnimationFrame(frame.current);
		setShift(to);
		if (from === to || !animates()) {
			setMoving(null);
			return;
		}
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / SNAP_MS);
			if (t >= 1) {
				setMoving(null);
				return;
			}
			setMoving(from + (to - from) * (1 - (1 - t) ** 3));
			frame.current = requestAnimationFrame(step);
		};
		frame.current = requestAnimationFrame(step);
	};
	const stepBy = (delta: number) => settle(moving ?? shift, shift + delta);

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		cancelAnimationFrame(frame.current);
		const startShift = moving ?? shift;
		drag.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startShift,
			pxPerDay: event.currentTarget.getBoundingClientRect().width / total,
			last: startShift,
		};
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// No capture (jsdom, or the pointer is already gone): moves still arrive while over the strip.
		}
		setMoving(startShift);
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		current.last = dragShift(
			current.startShift,
			event.clientX - current.startX,
			current.pxPerDay,
		);
		setMoving(current.last);
	};
	const endDrag = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;
		if (!current || current.pointerId !== event.pointerId) return;
		drag.current = null;
		settle(current.last, snapShift(current.last));
	};
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const delta =
			event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : null;
		if (delta !== null) stepBy(delta);
		else if (event.key === "Home") settle(moving ?? shift, 0);
		else return;
		event.preventDefault();
	};

	const first = target + shift - radius;
	const position =
		shift === 0
			? `centred on the stamp date ${date}`
			: `${dayIso(first)} to ${dayIso(first + total - 1)}, ${plural(Math.abs(shift), "day")} ${shift < 0 ? "before" : "after"} the stamp date`;
	return (
		<div className="review-pan">
			<div className="review-pan-row">
				<Button
					variant="ghost"
					size="sm"
					square
					aria-label="One day earlier"
					onClick={() => stepBy(-1)}
				>
					‹
				</Button>
				<div
					className="review-pan-track"
					role="slider"
					tabIndex={0}
					aria-label="Photo location history window"
					aria-orientation="horizontal"
					aria-valuemin={-36500}
					aria-valuemax={36500}
					aria-valuenow={shift}
					aria-valuetext={position}
					data-dragging={drag.current ? "" : undefined}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					onKeyDown={onKeyDown}
				>
					<DayStrip
						dayRuns={dayRuns}
						date={date}
						stampCode={stampCode}
						radius={radius}
						shift={moving ?? shift}
					/>
				</div>
				<Button
					variant="ghost"
					size="sm"
					square
					aria-label="One day later"
					onClick={() => stepBy(1)}
				>
					›
				</Button>
			</div>
			<div className="review-pan-meta">
				<span>{dayIso(first)}</span>
				<Button
					variant="ghost"
					size="sm"
					disabled={shift === 0}
					onClick={() => settle(moving ?? shift, 0)}
				>
					Stamp date
				</Button>
				<span>{dayIso(first + total - 1)}</span>
			</div>
		</div>
	);
}
