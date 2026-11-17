import { buildWorldShapes, type WorldShapes } from "@voyput/core";
import { useEffect, useState } from "react";

let worldPromise: Promise<WorldShapes> | null = null;

/** Natural Earth 110m outlines, loaded in a separate chunk on first use. */
function loadWorld(): Promise<WorldShapes> {
	worldPromise ??= import("./assets/world-countries.geojson?raw").then(
		(module) => buildWorldShapes(JSON.parse(module.default)),
	);
	// A failed load (e.g. a dropped chunk request) may succeed on the next visit.
	worldPromise.catch(() => {
		worldPromise = null;
	});
	return worldPromise;
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
