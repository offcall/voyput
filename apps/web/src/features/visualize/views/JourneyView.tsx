import type { WorldShapes } from "@voyput/core";
import type { StaysData } from "../data/useStays";
import { RoutePlayer } from "../route/RoutePlayer";
import "../route/route.css";

/** Journey: the stays played back as a flight across the world map. */
export function JourneyView({
	stays,
	world,
}: {
	stays: StaysData;
	world: WorldShapes | null;
}) {
	return (
		<RoutePlayer
			stays={stays.stays}
			locations={stays.locations}
			world={world}
		/>
	);
}
