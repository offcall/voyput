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

/** Light, dark (the default) or the system's choice; kept in localStorage and set as `data-theme` on <html> (ADR 0012). */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
	const [mode, setMode] = useState<ThemeMode>(readMode);
	useEffect(() => {
		document.documentElement.setAttribute("data-theme", mode);
		try {
			localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// Not saved; the choice still holds for this tab.
		}
	}, [mode]);
	return [mode, setMode];
}
