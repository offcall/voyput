import { ChartTip } from "@voyput/ui";
import {
	type FocusEvent,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/** What a mark's tip says: a muted label over a pixel value. */
export interface TipText {
	label: string;
	value: string;
}

interface ShownTip extends TipText {
	x: number;
	y: number;
	below: boolean;
}

/** Room above a point a tip needs; closer to the top it opens below. */
const ROOM_ABOVE = 56;
/** About half a tip's width, so a tip near an edge stays inside the chart. */
const HALF_TIP = 80;
const MARK = "[data-tip]";

/** Props that make an element a tip mark: focusable, named, and showing the tip. */
export interface MarkProps {
	"data-tip": string;
	role?: "img";
	"aria-label": string;
	onPointerEnter: (event: PointerEvent<Element>) => void;
	onPointerLeave: (event: PointerEvent<Element>) => void;
	onPointerDown: (event: PointerEvent<Element>) => void;
	onFocus: (event: FocusEvent<Element>) => void;
	onBlur: () => void;
	onKeyDown: (event: KeyboardEvent<Element>) => void;
}

/**
 * One `ChartTip` for every mark of a chart, on pointer hover and on keyboard
 * focus. The marks form one tab stop (roving tabindex): Tab reaches the
 * chart, arrow keys, Home and End move between marks in document order.
 * Each mark is named with the tip's text, so a screen reader reads the same.
 */
export function useMarkTip<H extends HTMLElement = HTMLDivElement>(): {
	/** The positioned element the tip is drawn in; holds every mark. */
	hostRef: RefObject<H | null>;
	/** Spread on a mark. `role: null` keeps the element's own role (e.g. a table cell). */
	mark: (key: string, text: TipText, role?: "img" | null) => MarkProps;
	tip: ReactNode;
} {
	const hostRef = useRef<H>(null);
	const current = useRef<string | null>(null);
	const [shown, setShown] = useState<ShownTip | null>(null);

	// Exactly one mark is in the tab order: the last focused one, else the first.
	useLayoutEffect(() => {
		const marks = hostRef.current?.querySelectorAll<HTMLElement | SVGElement>(
			MARK,
		);
		if (!marks || marks.length === 0) return;
		let stop = [...marks].find((m) => m.dataset.tip === current.current);
		stop ??= marks[0];
		for (const m of marks) m.setAttribute("tabindex", m === stop ? "0" : "-1");
	});

	const show = (
		text: TipText,
		clientX: number,
		top: number,
		bottom: number,
	) => {
		const host = hostRef.current;
		if (!host) return;
		const box = host.getBoundingClientRect();
		const half = Math.min(HALF_TIP, box.width / 2);
		const x = Math.min(Math.max(clientX - box.left, half), box.width - half);
		const below = top - box.top < ROOM_ABOVE;
		setShown({ ...text, x, y: (below ? bottom : top) - box.top, below });
	};
	const hide = () => setShown(null);

	// A tip opened by a tap closes on a tap anywhere off the marks.
	const open = shown !== null;
	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target;
			if (target instanceof Element && target.closest(MARK)) return;
			setShown(null);
		};
		document.addEventListener("pointerdown", away);
		return () => document.removeEventListener("pointerdown", away);
	}, [open]);

	const onKeyDown = (event: KeyboardEvent<Element>) => {
		const marks: Element[] = [
			...(hostRef.current?.querySelectorAll(MARK) ?? []),
		];
		const at = marks.indexOf(event.currentTarget);
		if (at < 0) return;
		const step: Record<string, number> = {
			ArrowRight: at + 1,
			ArrowDown: at + 1,
			ArrowLeft: at - 1,
			ArrowUp: at - 1,
			Home: 0,
			End: marks.length - 1,
		};
		const next = step[event.key];
		if (next === undefined) return;
		event.preventDefault();
		const target = marks[Math.min(Math.max(next, 0), marks.length - 1)];
		if (target instanceof HTMLElement || target instanceof SVGElement)
			target.focus();
	};

	const mark = (
		key: string,
		text: TipText,
		role: "img" | null = "img",
	): MarkProps => ({
		"data-tip": key,
		...(role ? { role } : {}),
		"aria-label": `${text.label}: ${text.value}`,
		onPointerEnter: (event) =>
			show(text, event.clientX, event.clientY, event.clientY),
		// A tap shows the tip until the next tap: touch leaves right after lifting.
		onPointerLeave: (event) => {
			if (event.pointerType !== "touch") hide();
		},
		onPointerDown: (event) => {
			if (event.pointerType === "touch")
				show(text, event.clientX, event.clientY, event.clientY);
		},
		onFocus: (event) => {
			const host = hostRef.current;
			for (const m of host?.querySelectorAll(MARK) ?? [])
				m.setAttribute("tabindex", m === event.currentTarget ? "0" : "-1");
			current.current = key;
			const r = event.currentTarget.getBoundingClientRect();
			show(text, r.left + r.width / 2, r.top, r.bottom);
		},
		onBlur: hide,
		onKeyDown,
	});

	const tip = shown ? (
		<ChartTip
			label={shown.label}
			value={shown.value}
			x={shown.x}
			y={shown.y}
			below={shown.below}
		/>
	) : null;
	return { hostRef, mark, tip };
}
