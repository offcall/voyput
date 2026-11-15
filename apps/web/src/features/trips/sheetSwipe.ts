import { type PointerEvent, useRef } from "react";

/** What a finished drag on the stay sheet's head does. */
export type SheetSwipe = "close" | "previous" | "next" | null;

/** A drag down this far closes the sheet. */
const CLOSE_PX = 80;
/** A drag sideways this far opens the previous or next stay. */
const PAGE_PX = 60;

/**
 * Down closes; left opens the next stay, right the previous one (like
 * turning a page). Whichever way the drag went further wins.
 */
export function sheetSwipe(dx: number, dy: number): SheetSwipe {
	if (Math.abs(dx) > Math.abs(dy)) {
		if (dx <= -PAGE_PX) return "next";
		if (dx >= PAGE_PX) return "previous";
		return null;
	}
	return dy >= CLOSE_PX ? "close" : null;
}

/** The stay panel is a bottom sheet below this width (see trips.css). */
const SHEET_QUERY = "(max-width: 1179px)";

const isSheet = () =>
	typeof window.matchMedia === "function" &&
	window.matchMedia(SHEET_QUERY).matches;

/** Controls inside the head keep their own taps. */
const onControl = (target: EventTarget) =>
	target instanceof Element &&
	target.closest("button, a, input, select, textarea") !== null;

/**
 * Pointer handlers for the sheet's head: the sheet follows a drag down, and
 * on release `sheetSwipe` decides. Does nothing while the panel is not a sheet.
 */
export function useSheetSwipe(on: {
	close: () => void;
	previous?: (() => void) | undefined;
	next?: (() => void) | undefined;
}) {
	const start = useRef<{ x: number; y: number; id: number } | null>(null);
	const sheetOf = (el: Element) =>
		el.closest<HTMLElement>("[data-sheet]") ?? null;
	const reset = (el: Element) => {
		start.current = null;
		const sheet = sheetOf(el);
		if (sheet) sheet.style.transform = "";
	};
	return {
		onPointerDown: (e: PointerEvent<HTMLElement>) => {
			if (!isSheet() || onControl(e.target) || e.button !== 0) return;
			start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
			e.currentTarget.setPointerCapture?.(e.pointerId);
		},
		onPointerMove: (e: PointerEvent<HTMLElement>) => {
			const from = start.current;
			if (!from || from.id !== e.pointerId) return;
			const dy = Math.max(0, e.clientY - from.y);
			const sheet = sheetOf(e.currentTarget);
			if (sheet) sheet.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
		},
		onPointerUp: (e: PointerEvent<HTMLElement>) => {
			const from = start.current;
			if (!from || from.id !== e.pointerId) return;
			reset(e.currentTarget);
			const action = sheetSwipe(e.clientX - from.x, e.clientY - from.y);
			if (action === "close") on.close();
			else if (action === "previous") on.previous?.();
			else if (action === "next") on.next?.();
		},
		onPointerCancel: (e: PointerEvent<HTMLElement>) => reset(e.currentTarget),
	};
}
