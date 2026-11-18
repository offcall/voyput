import { useEffect, useRef, useState } from "react";

/** Width of the element in CSS pixels; `fallback` where ResizeObserver is missing (jsdom). */
export function useWidth(fallback: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(fallback);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			const w = entry?.contentRect.width;
			if (w) setWidth(Math.round(w));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}
