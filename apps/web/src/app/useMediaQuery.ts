import { useSyncExternalStore } from "react";

/**
 * The phone and tablet layout (bottom tab bar), the same breakpoint as the kit's
 * `.vp-shell` CSS. Where `matchMedia` is missing (jsdom) it is the desktop.
 */
export const TOUCH_LAYOUT = "(max-width: 860px)";

/** Whether a media query matches now; follows changes. False without `matchMedia`. */
export function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(onChange) => {
			if (typeof window.matchMedia !== "function") return () => {};
			const media = window.matchMedia(query);
			media.addEventListener("change", onChange);
			return () => media.removeEventListener("change", onChange);
		},
		() =>
			typeof window.matchMedia === "function" &&
			window.matchMedia(query).matches,
	);
}
