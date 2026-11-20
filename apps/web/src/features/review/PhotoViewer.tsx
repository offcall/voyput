import { rotateBy, type StampBox } from "@voyput/core";
import { Button } from "@voyput/ui";
import {
	type CSSProperties,
	type PointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import type { BoxTone } from "./boxes";
import { setPhotoRotation } from "./reviewStore";

const MAX_SCALE = 8;

interface View {
	scale: number;
	x: number;
	y: number;
}
const FITTED: View = { scale: 1, x: 0, y: 0 };
/** Two taps closer than this in time and space are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

interface Point {
	x: number;
	y: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2,
});

/** One stamp's outline on the photo. */
export interface PhotoBox {
	stampId: string;
	/** The stamp card's number. */
	number: number;
	box: StampBox;
	tone: BoxTone;
}
/** Moving less than this after pressing on the photo is a click, not a pan. */
const CLICK_PX = 4;

/**
 * The page photo, fitted to its frame and never cropped; zoom, pan and rotate.
 * Stamp boxes sit on the photo and turn, zoom and pan with it.
 */
export function PhotoViewer({
	photo,
	boxes = [],
	activeStampId = null,
	onPickStamp,
}: {
	photo: PhotoRecord;
	boxes?: readonly PhotoBox[];
	/** The stamp whose card is hovered or open: its box stands out. */
	activeStampId?: string | null;
	onPickStamp?: (stampId: string) => void;
}) {
	const db = useDb();
	const frameRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [natural, setNatural] = useState({ w: 0, h: 0 });
	const [frame, setFrame] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<View>(FITTED);
	/** A press that pans once it moves; the pointer is captured only then, so a still press clicks a box. */
	const drag = useRef<{
		x: number;
		y: number;
		start: Point;
		captured: boolean;
	} | null>(null);
	/** Fingers on the photo, in px from the frame centre. */
	const pointers = useRef(new Map<number, Point>());
	/** A two-finger pinch: where it started and the view then. */
	const pinch = useRef<{ distance: number; mid: Point; view: View } | null>(
		null,
	);
	/** Where the last single finger went down; a tap ends near it. */
	const tapStart = useRef<Point | null>(null);
	const lastTap = useRef<{ at: Point; time: number } | null>(null);
	/** When a double tap last zoomed, so the browser's own dblclick after it is ignored. */
	const touchZoomed = useRef(-Infinity);

	useEffect(() => {
		const next = URL.createObjectURL(photo.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [photo.blob]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: back to the fitted view on another photo or rotation
	useEffect(() => setView(FITTED), [photo.id, photo.rotation]);

	useLayoutEffect(() => {
		const element = frameRef.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry)
				setFrame({ w: entry.contentRect.width, h: entry.contentRect.height });
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const sideways = photo.rotation === 90 || photo.rotation === 270;
	const boxW = sideways ? natural.h : natural.w;
	const boxH = sideways ? natural.w : natural.h;
	const fit =
		boxW && boxH && frame.w && frame.h
			? Math.min(frame.w / boxW, frame.h / boxH)
			: 0;

	const clamp = (next: View): View => {
		const maxX = Math.max(0, (boxW * fit * next.scale - frame.w) / 2);
		const maxY = Math.max(0, (boxH * fit * next.scale - frame.h) / 2);
		return {
			scale: next.scale,
			x: Math.min(maxX, Math.max(-maxX, next.x)),
			y: Math.min(maxY, Math.max(-maxY, next.y)),
		};
	};
	const zoom = (factor: number) =>
		setView((current) => {
			const scale = Math.min(MAX_SCALE, Math.max(1, current.scale * factor));
			const k = scale / current.scale;
			return clamp({ scale, x: current.x * k, y: current.y * k });
		});
	const rotate = (degrees: 90 | -90) =>
		void setPhotoRotation(db, photo.id, rotateBy(photo.rotation, degrees));

	/** Zooms to `scale` keeping the point `at` (px from the frame centre) still. */
	const zoomAt = (current: View, scale: number, at: Point): View => {
		const next = Math.min(MAX_SCALE, Math.max(1, scale));
		const k = next / current.scale;
		return clamp({
			scale: next,
			x: at.x - (at.x - current.x) * k,
			y: at.y - (at.y - current.y) * k,
		});
	};
	/** A pointer position in px from the frame centre. */
	const fromCentre = (event: PointerEvent<HTMLDivElement>): Point => {
		const box = event.currentTarget.getBoundingClientRect();
		return {
			x: event.clientX - box.left - box.width / 2,
			y: event.clientY - box.top - box.height / 2,
		};
	};

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		pointers.current.set(event.pointerId, fromCentre(event));
		tapStart.current = pointers.current.size === 1 ? fromCentre(event) : null;
		if (pointers.current.size === 2) {
			// A second finger: pinch from here, no pan.
			drag.current = null;
			const [a, b] = [...pointers.current.values()];
			if (a && b)
				pinch.current = { distance: distance(a, b), mid: middle(a, b), view };
			return;
		}
		if (pointers.current.size > 2 || view.scale <= 1) return;
		drag.current = {
			x: event.clientX,
			y: event.clientY,
			start: { x: event.clientX, y: event.clientY },
			captured: false,
		};
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (pointers.current.has(event.pointerId))
			pointers.current.set(event.pointerId, fromCentre(event));
		const start = pinch.current;
		if (start) {
			const [a, b] = [...pointers.current.values()];
			if (!a || !b || start.distance === 0) return;
			// The photo point under the fingers' first middle follows their middle now.
			const scaled = zoomAt(
				start.view,
				(start.view.scale * distance(a, b)) / start.distance,
				start.mid,
			);
			const mid = middle(a, b);
			setView(
				clamp({
					...scaled,
					x: scaled.x + mid.x - start.mid.x,
					y: scaled.y + mid.y - start.mid.y,
				}),
			);
			return;
		}
		const last = drag.current;
		if (!last) return;
		const at = { x: event.clientX, y: event.clientY };
		const captured = last.captured || distance(last.start, at) > CLICK_PX;
		if (captured && !last.captured)
			event.currentTarget.setPointerCapture?.(event.pointerId);
		drag.current = { ...at, start: last.start, captured };
		setView((current) =>
			clamp({
				...current,
				x: current.x + event.clientX - last.x,
				y: current.y + event.clientY - last.y,
			}),
		);
	};
	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		const at = pointers.current.get(event.pointerId);
		const wasPinch = pinch.current !== null;
		pointers.current.delete(event.pointerId);
		if (pointers.current.size < 2) pinch.current = null;
		drag.current = null;
		const start = tapStart.current;
		tapStart.current = null;
		if (event.pointerType !== "touch" || wasPinch || !at || !start) return;
		if (distance(start, at) > DOUBLE_TAP_PX) return;
		// Double tap: zoom in at the tap, or back to the fitted view.
		const tap = { at, time: event.timeStamp };
		const previous = lastTap.current;
		lastTap.current = tap;
		if (
			previous &&
			tap.time - previous.time < DOUBLE_TAP_MS &&
			distance(previous.at, at) < DOUBLE_TAP_PX
		) {
			lastTap.current = null;
			touchZoomed.current = tap.time;
			setView((current) =>
				current.scale > 1 ? FITTED : zoomAt(current, 2.5, at),
			);
		}
	};
	const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
		pointers.current.delete(event.pointerId);
		pinch.current = null;
		drag.current = null;
	};

	return (
		<div className="review-viewer">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer zoom and pan; the buttons below do the same from the keyboard */}
			<div
				ref={frameRef}
				className="review-viewer-frame"
				data-zoomed={view.scale > 1 || undefined}
				style={
					boxW && boxH
						? ({ "--review-photo-ratio": `${boxW} / ${boxH}` } as CSSProperties)
						: undefined
				}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerCancel}
				onDoubleClick={(event) => {
					if (event.timeStamp - touchZoomed.current < 1000) return;
					if (view.scale > 1) setView(FITTED);
					else zoom(2.5);
				}}
				onWheel={(event) => {
					if (event.ctrlKey || event.metaKey)
						zoom(Math.exp(-event.deltaY * 0.01));
				}}
			>
				{url ? (
					<div
						className="review-viewer-page"
						style={
							{
								width: fit ? natural.w * fit : undefined,
								height: fit ? natural.h * fit : undefined,
								maxWidth: fit ? undefined : "100%",
								maxHeight: fit ? undefined : "100%",
								transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${photo.rotation}deg)`,
								"--review-zoom": view.scale,
								"--review-turn": `${-photo.rotation}deg`,
							} as CSSProperties
						}
					>
						<img
							src={url}
							alt={photo.name}
							draggable={false}
							data-rotation={photo.rotation}
							onLoad={(event) =>
								setNatural({
									w: event.currentTarget.naturalWidth,
									h: event.currentTarget.naturalHeight,
								})
							}
						/>
						{boxes.map(({ stampId, number, box, tone }) => (
							<button
								key={stampId}
								type="button"
								className="review-stamp-box"
								data-tone={tone}
								data-active={stampId === activeStampId || undefined}
								aria-label={`Show stamp ${number}`}
								style={{
									left: `${box.x * 100}%`,
									top: `${box.y * 100}%`,
									width: `${box.width * 100}%`,
									height: `${box.height * 100}%`,
								}}
								onClick={() => onPickStamp?.(stampId)}
							>
								<span className="review-stamp-box-number">{number}</span>
							</button>
						))}
					</div>
				) : null}
			</div>
			<div className="review-viewer-tools">
				<Button
					className="review-tool"
					aria-label="Rotate left"
					onClick={() => rotate(-90)}
				>
					↺
				</Button>
				<Button
					className="review-tool"
					aria-label="Rotate right"
					onClick={() => rotate(90)}
				>
					↻
				</Button>
				<span className="review-tool-gap" />
				<Button
					className="review-tool review-tool-step"
					aria-label="Zoom out"
					onClick={() => zoom(1 / 1.5)}
				>
					−
				</Button>
				<Button
					className="review-tool review-tool-step"
					aria-label="Zoom in"
					onClick={() => zoom(1.5)}
				>
					+
				</Button>
				<Button
					className="review-tool review-tool-zoom"
					onClick={() => setView(FITTED)}
					disabled={view.scale === 1}
				>
					{Math.round(view.scale * 100)}%
				</Button>
			</div>
			<p className="review-viewer-hint">
				<span className="review-hint-mouse">
					Double-click or Ctrl + scroll to zoom, drag to pan.
				</span>
				<span className="review-hint-touch">
					Pinch or double-tap to zoom, drag to pan.
				</span>
			</p>
		</div>
	);
}
