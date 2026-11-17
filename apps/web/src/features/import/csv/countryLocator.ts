import {
	buildCountryLocator,
	type CountryLocator,
	decodeCountryOutlines,
} from "@voyput/core";

let locatorPromise: Promise<CountryLocator> | null = null;

/**
 * The country at a point, from Natural Earth 10m outlines (ADR 0033). The
 * outlines (~1.7 MB gzipped) load in their own chunk on the first import.
 */
export function loadCountryLocator(): Promise<CountryLocator> {
	locatorPromise ??= import("./assets/country-outlines.json?raw").then(
		(module) =>
			buildCountryLocator(decodeCountryOutlines(JSON.parse(module.default))),
	);
	// A failed load (e.g. a dropped chunk request) may succeed on the next try.
	locatorPromise.catch(() => {
		locatorPromise = null;
	});
	return locatorPromise;
}
