import {
	buildCountryLocator,
	buildWorldShapes,
	type CountryLocator,
	type WorldShapes,
} from "@voyput/core";
import { useEffect, useState } from "react";

let geoJsonPromise: Promise<unknown> | null = null;

/** Natural Earth 110m outlines as GeoJSON, loaded in a separate chunk on first use. */
function loadGeoJson(): Promise<unknown> {
	geoJsonPromise ??= import("./assets/world-countries.geojson?raw").then(
		(module): unknown => JSON.parse(module.default),
	);
	// A failed load (e.g. a dropped chunk request) may succeed on the next visit.
	geoJsonPromise.catch(() => {
		geoJsonPromise = null;
	});
	return geoJsonPromise;
}

let worldPromise: Promise<WorldShapes> | null = null;

function loadWorld(): Promise<WorldShapes> {
	worldPromise ??= loadGeoJson().then(buildWorldShapes);
	worldPromise.catch(() => {
		worldPromise = null;
	});
	return worldPromise;
}

/** The country at a point, from the same outlines (ADR 0033). */
export function loadCountryLocator(): Promise<CountryLocator> {
	return loadGeoJson().then((geoJson) => buildCountryLocator(geoJson));
}

/** World outlines, or `null` until they are loaded. */
export function useWorld(): WorldShapes | null {
	const [world, setWorld] = useState<WorldShapes | null>(null);
	useEffect(() => {
		let alive = true;
		loadWorld()
			.then((shapes) => {
				if (alive) setWorld(shapes);
			})
			.catch((error: unknown) => {
				console.error("Could not load world outlines", error);
			});
		return () => {
			alive = false;
		};
	}, []);
	return world;
}
