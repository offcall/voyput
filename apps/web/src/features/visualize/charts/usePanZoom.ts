import type { MapView } from "@voyput/core";
import { type RefObject, useEffect, useRef, useState } from "react";

export interface PanZoomOptions {
	/** Narrowest and widest view width in map units. */
	minWidth: number;
	maxWidth: number;
	/** The wheel zooms (and so stops the page scrolling over the map). */
	wheel?: boolean;
	/** Only touch pans and pinches; a mouse leaves the map alone. */
	touchOnly?: boolean;
}

const WHEEL_STEP = 1.2;

/**
 * `view` grown around its centre to the element's aspect, so a map in a box
 * taller (phone) or wider (landscape) than 2 : 1 fills it instead of leaving
 * empty bands. Same view when the box has the view's own aspect.
 */
export function fitAspect(
	view: MapView,
	size: readonly [number, number] | null,
): MapView {
	const [x, y, w, h] = view;
	if (!size) return view;
	const [width, height] = size;
	if (width <= 0 || height <= 0 || w <= 0 || h <= 0) return view;
	const want = width / height;
	if (Math.abs(want - w / h) < 1e-3) return view;
	if (want < w / h) {
		const tall = w / want;
		return [x, y - (tall - h) / 2, w, tall];
	}
	const wide = h * want;
	return [x - (wide - w) / 2, y, wide, h];
}

/** `view` scaled by `factor` around the map point `(mx, my)`. */
function zoomAt(
	view: MapView,
	factor: number,
	mx: number,
	my: number,
): MapView {
	const [x, y, w, h] = view;
	return [
		mx - (mx - x) * factor,
		my - (my - y) * factor,
		w * factor,
		h * factor,
	];
}

/** CSS size of an element, or `null` before it is measured (or without `ResizeObserver`). */
export function useBoxSize(
	ref: RefObject<Element | null>,
): [number, number] | null {
	const [size, setSize] = useState<[number, number] | null>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver !== "function") return;
		const observer = new ResizeObserver(() => {
			const box = el.getBoundingClientRect();
			setSize((prev) =>
				prev && prev[0] === box.width && prev[1] === box.height
					? prev
					: [box.width, box.height],
			);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return size;
}

/**
 * Drag to pan, pinch (and optionally the wheel) to zoom an SVG map drawn with
 * the viewBox `shown`. `onView` updates the view `shown` is fitted from; the
 * fit only grows a view around its centre, so pans and zooms carry over.
 * Listeners are native so the wheel and touch can cancel scrolling.
 */
export function usePanZoom(
	ref: RefObject<Element | null>,
	shown: MapView,
	onView: (update: (view: MapView) => MapView) => void,
	{ minWidth, maxWidth, wheel = true, touchOnly = false }: PanZoomOptions,
): void {
	// The listeners read the drawn view without being re-attached each frame.
	const shownRef = useRef(shown);
	shownRef.current = shown;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const clampZoom = (v: MapView, factor: number, mx: number, my: number) => {
			const width = v[2] * factor;
			if (width < minWidth || width > maxWidth * 1.01) return v;
			return zoomAt(v, factor, mx, my);
		};
		/** Map point under a client point, and map units per CSS pixel. */
		const toMap = (clientX: number, clientY: number) => {
			const box = el.getBoundingClientRect();
			const [sx, sy, sw] = shownRef.current;
			const scale = box.width > 0 ? sw / box.width : 0;
			return {
				x: sx + (clientX - box.left) * scale,
				y: sy + (clientY - box.top) * scale,
				scale,
			};
		};

		const onWheel = (event: Event) => {
			if (!(event instanceof WheelEvent)) return;
			event.preventDefault();
			const factor = event.deltaY > 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
			// Centre zoom, as before the phone layout.
			onView((v) => clampZoom(v, factor, v[0] + v[2] / 2, v[1] + v[3] / 2));
		};

		const pointers = new Map<number, { x: number; y: number }>();
		const down = (event: Event) => {
			if (!(event instanceof PointerEvent)) return;
			if (touchOnly && event.pointerType !== "touch") return;
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			el.setPointerCapture?.(event.pointerId);
		};
		const move = (event: Event) => {
			if (!(event instanceof PointerEvent)) return;
			const before = pointers.get(event.pointerId);
			if (!before) return;
			const now = { x: event.clientX, y: event.clientY };
			if (pointers.size === 1) {
				const { scale } = toMap(now.x, now.y);
				const dx = (now.x - before.x) * scale;
				const dy = (now.y - before.y) * scale;
				onView((v) => [v[0] - dx, v[1] - dy, v[2], v[3]]);
			} else if (pointers.size === 2) {
				const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
				if (!other) return;
				const was = Math.hypot(before.x - other.x, before.y - other.y);
				const is = Math.hypot(now.x - other.x, now.y - other.y);
				if (was > 0 && is > 0) {
					const mid = toMap((now.x + other.x) / 2, (now.y + other.y) / 2);
					const dx = ((now.x - before.x) / 2) * mid.scale;
					const dy = ((now.y - before.y) / 2) * mid.scale;
					onView((v) => {
						const moved: MapView = [v[0] - dx, v[1] - dy, v[2], v[3]];
						return clampZoom(moved, was / is, mid.x, mid.y);
					});
				}
			}
			pointers.set(event.pointerId, now);
		};
		const up = (event: Event) => {
			if (event instanceof PointerEvent) pointers.delete(event.pointerId);
		};

		if (wheel) el.addEventListener("wheel", onWheel, { passive: false });
		el.addEventListener("pointerdown", down);
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
		el.addEventListener("pointercancel", up);
		return () => {
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
			el.removeEventListener("pointercancel", up);
		};
	}, [ref, onView, minWidth, maxWidth, wheel, touchOnly]);
}
