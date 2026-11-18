import {
	type CountryPalette,
	countryPalette,
	rankCountries,
} from "@voyput/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useLiveQuery } from "../data/useLiveQuery";
import { useDb } from "../db/DbContext";
import type { VoyputDb } from "../db/db";

const HASHED = countryPalette([]);

const CountryColoursContext = createContext<CountryPalette>(HASHED);

/** Location countries by row count, counted on the `countryCode` index (no rows read). */
export async function rankLocationCountries(db: VoyputDb): Promise<string[]> {
	const codes = await db.locations.orderBy("countryCode").uniqueKeys();
	const counts = await Promise.all(
		codes.map(async (key) => {
			const code = String(key);
			const count = await db.locations
				.where("countryCode")
				.equals(code)
				.count();
			return [code, count] as const;
		}),
	);
	return rankCountries(counts);
}

/** Stamp countries by stamp count. */
async function rankStampCountries(db: VoyputDb): Promise<string[]> {
	const counts = new Map<string, number>();
	await db.stamps.each((stamp) => {
		if (stamp.countryCode)
			counts.set(stamp.countryCode, (counts.get(stamp.countryCode) ?? 0) + 1);
	});
	return rankCountries(counts);
}

/**
 * One colour per country for the whole app, so a country looks the same on
 * every page and countries shown together never share a palette slot.
 * Location countries take the slots first; countries known only from stamps
 * follow, so editing stamps never moves a location country to another slot.
 */
export function CountryColoursProvider({ children }: { children: ReactNode }) {
	const db = useDb();
	// Joined to strings so an unchanged ranking keeps the palette identity.
	const locations = useLiveQuery(
		useCallback(async () => (await rankLocationCountries(db)).join(","), [db]),
	).data;
	const stamps = useLiveQuery(
		useCallback(async () => (await rankStampCountries(db)).join(","), [db]),
	).data;
	const palette = useMemo(() => {
		const ranked = locations ? locations.split(",") : [];
		const known = new Set(ranked);
		const stampOnly = (stamps ? stamps.split(",") : []).filter(
			(code) => !known.has(code),
		);
		return countryPalette([...ranked, ...stampOnly]);
	}, [locations, stamps]);
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

/** Colour of every country outside the kept ones: one quiet tone. */
export const NEUTRAL_COUNTRY_COLOUR = "var(--vp-pixel-grey)";

/**
 * Keeps the colours of `keep` (e.g. the top countries) and paints every other
 * country one neutral tone, so a history with 50 countries stays readable.
 * An empty `keep` (nothing ranked yet) changes nothing.
 */
export function KeepCountryColours({
	keep,
	children,
}: {
	keep: readonly string[];
	children: ReactNode;
}) {
	const parent = useContext(CountryColoursContext);
	const key = keep.join(",");
	const palette = useMemo((): CountryPalette => {
		if (!key) return parent;
		const kept = new Set(key.split(",").map((c) => c.toUpperCase()));
		return (code) =>
			kept.has(code.toUpperCase()) ? parent(code) : NEUTRAL_COUNTRY_COLOUR;
	}, [parent, key]);
	return (
		<CountryColoursContext.Provider value={palette}>
			{children}
		</CountryColoursContext.Provider>
	);
}
