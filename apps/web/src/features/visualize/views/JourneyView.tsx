import type { Stay } from "@voyput/core";
import { useMemo } from "react";
import type { InsightsContext } from "../InsightsPage";
import { RoutePlayer } from "../route/RoutePlayer";
import { NoMatch } from "./CalendarView";
import "../route/route.css";

/**
 * Journey: the stays played back as a flight across the world map. With a
 * filter it plays the filtered stays, cut to its dates, and their photos.
 */
export function JourneyView({ ctx }: { ctx: InsightsContext }) {
	const { isFiltered, filtered, stays, photos, world } = ctx;
	const shown = useMemo(
		(): Stay[] =>
			isFiltered
				? filtered.map((s) => ({
						...s,
						start: s.clipStart,
						end: s.clipEnd,
						days: s.clippedDays,
					}))
				: stays.stays,
		[isFiltered, filtered, stays],
	);
	if (shown.length === 0) return <NoMatch onReset={ctx.onReset} />;
	return (
		<RoutePlayer
			stays={shown}
			locations={isFiltered ? photos : stays.locations}
			world={world}
		/>
	);
}
