import { rotateBy } from "@voyput/core";
import { Button } from "@voyput/ui";
import {
	type PointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDb } from "../../db/DbContext";
import type { PhotoRecord } from "../../db/db";
import { setPhotoRotation } from "./reviewStore";

const MAX_SCALE = 8;

interface View {
	scale: number;
	x: number;
	y: number;
}
const FITTED: View = { scale: 1, x: 0, y: 0 };

/** The page photo, fitted to its frame and never cropped; zoom, pan and rotate. */
export function PhotoViewer({ photo }: { photo: PhotoRecord }) {
	const db = useDb();
	const frameRef = useRef<HTMLDivElement>(null);
	const [url, setUrl] = useState<string | null>(null);
	const [natural, setNatural] = useState({ w: 0, h: 0 });
	const [frame, setFrame] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<View>(FITTED);
	const drag = useRef<{ x: number; y: number } | null>(null);

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

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (view.scale <= 1) return;
		event.currentTarget.setPointerCapture?.(event.pointerId);
		drag.current = { x: event.clientX, y: event.clientY };
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const start = drag.current;
		if (!start) return;
		drag.current = { x: event.clientX, y: event.clientY };
		setView((current) =>
			clamp({
				...current,
				x: current.x + event.clientX - start.x,
				y: current.y + event.clientY - start.y,
			}),
		);
	};

	return (
		<div className="review-viewer">
			{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer zoom and pan; the buttons below do the same from the keyboard */}
			<div
				ref={frameRef}
				className="review-viewer-frame"
				data-zoomed={view.scale > 1 || undefined}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={() => {
					drag.current = null;
				}}
				onDoubleClick={() => (view.scale > 1 ? setView(FITTED) : zoom(2.5))}
				onWheel={(event) => {
					if (event.ctrlKey || event.metaKey)
						zoom(Math.exp(-event.deltaY * 0.01));
				}}
			>
				{url ? (
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
						style={{
							width: fit ? natural.w * fit : undefined,
							height: fit ? natural.h * fit : undefined,
							maxWidth: fit ? undefined : "100%",
							maxHeight: fit ? undefined : "100%",
							transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${photo.rotation}deg)`,
						}}
					/>
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
					className="review-tool"
					aria-label="Zoom out"
					onClick={() => zoom(1 / 1.5)}
				>
					−
				</Button>
				<Button
					className="review-tool"
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
				Double-click or Ctrl + scroll to zoom, drag to pan.
			</p>
		</div>
	);
}
