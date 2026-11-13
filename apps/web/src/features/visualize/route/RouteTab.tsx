import { Link } from "@tanstack/react-router";
import { EmptyState, PixelArt } from "@voyput/ui";
import type { ReactNode } from "react";
import { ChartPanel } from "../ChartPanel";
import { useStays } from "../data/useStays";
import { useWorld } from "../useWorld";
import { RoutePlayer } from "./RoutePlayer";
import "../visualize.css";
import "./route.css";

/** The Route tab: your stays played back as a flight across the world map. */
export function RouteTab() {
	const source = useStays();
	const world = useWorld();

	let body: ReactNode;
	if (source.status === "error") {
		body = <p role="alert">Could not read your data: {source.message}</p>;
	} else if (source.status === "loading") {
		body = <p>Loading…</p>;
	} else if (source.data.stays.length === 0) {
		const noLocations = source.data.locations.length === 0;
		body = (
			<EmptyState
				art={<PixelArt name="plane" scale={4} />}
				title="No trips to play yet"
			>
				<p>
					The route is drawn from your trips.{" "}
					{noLocations ? (
						<>
							<Link to="/import">Import your photo locations</Link>, then check
							your trips on <Link to="/trips">Trips</Link>.
						</>
					) : (
						<>
							Build or confirm them on <Link to="/trips">Trips</Link>.
						</>
					)}
				</p>
			</EmptyState>
		);
	} else {
		body = (
			<RoutePlayer
				stays={source.data.stays}
				locations={source.data.locations}
				world={world}
			/>
		);
	}

	return (
		<ChartPanel
			title="Route"
			sprite="plane"
			description="Your travels replayed in order, stop by stop."
		>
			{body}
		</ChartPanel>
	);
}
