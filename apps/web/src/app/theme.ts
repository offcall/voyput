import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "voyput:theme";

function readMode(): ThemeMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === "light" || stored === "system" ? stored : "dark";
	} catch {
		return "dark";
	}
}

/** The top bar's colour (`--vp-surface`) per theme, for the browser's own bar. */
const BAR_COLOUR = { light: "#ffffff", dark: "#1c1f23" } as const;

/** Sets `<meta name="theme-color">` (phone status and address bars) to the top bar's colour. */
function paintBrowserBar(mode: ThemeMode) {
	const meta = document.querySelector('meta[name="theme-color"]');
	if (!meta) return;
	const light =
		mode === "light" ||
		(mode === "system" &&
			typeof window.matchMedia === "function" &&
			window.matchMedia("(prefers-color-scheme: light)").matches);
	meta.setAttribute("content", light ? BAR_COLOUR.light : BAR_COLOUR.dark);
}

/** Light, dark (the default) or the system's choice; kept in localStorage and set as `data-theme` on <html> (ADR 0012). */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
	const [mode, setMode] = useState<ThemeMode>(readMode);
	useEffect(() => {
		document.documentElement.setAttribute("data-theme", mode);
		paintBrowserBar(mode);
		try {
			localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// Not saved; the choice still holds for this tab.
		}
	}, [mode]);
	return [mode, setMode];
}
