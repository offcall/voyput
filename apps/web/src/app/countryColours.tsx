import { type CountryPalette, countryPalette } from "@voyput/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useDb } from "../db/DbContext";
import { useLiveQuery } from "../features/import/photos/useLiveQuery";

const HASHED = countryPalette([]);

const CountryColoursContext = createContext<CountryPalette>(HASHED);

/**
 * One colour per country for the whole app, picked from every stored location
 * and stamp, so a country looks the same on every page and countries shown
 * together never share a palette slot.
 */
export function CountryColoursProvider({ children }: { children: ReactNode }) {
	const db = useDb();
	const locationCodes = useLiveQuery(
		useCallback(
			async () => (await db.locations.toArray()).map((row) => row.countryCode),
			[db],
		),
	).data;
	const stampCodes = useLiveQuery(
		useCallback(
			async () =>
				(await db.stamps.toArray()).flatMap((stamp) =>
					stamp.countryCode ? [stamp.countryCode] : [],
				),
			[db],
		),
	).data;
	const palette = useMemo(
		() => countryPalette([...(locationCodes ?? []), ...(stampCodes ?? [])]),
		[locationCodes, stampCodes],
	);
	return (
		<CountryColoursContext.Provider value={palette}>
			{children}
		</CountryColoursContext.Provider>
	);
}

/** CSS colour of a country, e.g. `var(--vp-cat-3)`; hashed without a provider. */
export function useCountryColour(): CountryPalette {
	return useContext(CountryColoursContext);
}

/**
 * Same colours as concrete values for canvas drawing, which cannot read CSS
 * variables. Resolved against the current theme when first asked for.
 */
export function useCanvasCountryColour(): CountryPalette {
	const colour = useCountryColour();
	return useMemo(() => {
		const cache = new Map<string, string>();
		return (code) => {
			const css = colour(code);
			let resolved = cache.get(css);
			if (resolved === undefined) {
				resolved = resolveCssColour(css);
				cache.set(css, resolved);
			}
			return resolved;
		};
	}, [colour]);
}

function resolveCssColour(css: string): string {
	if (!css.startsWith("var(") || typeof document === "undefined") return css;
	const probe = document.createElement("span");
	probe.style.color = css;
	probe.style.display = "none";
	document.body.append(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();
	return resolved || css;
}
