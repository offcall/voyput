import { useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "voyput:theme";

function readMode(): ThemeMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === "light" || stored === "dark" ? stored : "system";
	} catch {
		return "system";
	}
}

/** Light, dark or the system's choice; kept in localStorage and set as `data-theme` on <html>. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
	const [mode, setMode] = useState<ThemeMode>(readMode);
	useEffect(() => {
		const root = document.documentElement;
		if (mode === "system") root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", mode);
		try {
			if (mode === "system") localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// Not saved; the choice still holds for this tab.
		}
	}, [mode]);
	return [mode, setMode];
}
