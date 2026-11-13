import { ChartPanel } from "../ChartPanel";
import type { StaysData } from "../data/useStays";
import { type VizHave, VizHint } from "../needs";
import { useWorld } from "../useWorld";
import { RoutePlayer } from "./RoutePlayer";
import "../visualize.css";
import "./route.css";

/** The Route tab: your stays played back as a flight across the world map. */
export function RouteTab({ data, have }: { data: StaysData; have: VizHave }) {
	const world = useWorld();
	return (
		<ChartPanel
			title="Route"
			sprite="plane"
			description="Your travels replayed in order, stop by stop."
		>
			{have.locations === 0 ? (
				<VizHint step="locations" label="Import locations">
					Import your location history to follow your photos exactly.
				</VizHint>
			) : null}
			<RoutePlayer
				stays={data.stays}
				locations={data.locations}
				world={world}
			/>
		</ChartPanel>
	);
}
