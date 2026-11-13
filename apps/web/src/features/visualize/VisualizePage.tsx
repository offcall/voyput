import { Link, useParams } from "@tanstack/react-router";
import { buildVizData, splitRowsByTrips } from "@voyput/core";
import {
	EmptyState,
	PageHeader,
	PixelArt,
	Stack,
	Stat,
	StatGroup,
} from "@voyput/ui";
import { useMemo, useState } from "react";
import { formatInt } from "./charts/format";
import { TripFilter } from "./TripFilter";
import { findVizTab, firstVizTab } from "./tabs";
import { useVizSource } from "./useVizSource";
import { useWorld } from "./useWorld";
import "./visualize.css";

function Header() {
	return (
		<PageHeader
			eyebrow="Step 5 of 5"
			title="Visualize"
			description="Your travels drawn from photo locations: where, when and how far."
			art={<PixelArt name="globe" scale={4} />}
		/>
	);
}

/**
 * The `/visualize` layout: loads the data once and keeps the trip filter while the
 * `/visualize/$tab` child changes; the shell nav lists the tabs.
 */
export function VisualizePage() {
	const { tab: tabId } = useParams({ strict: false });
	// The router redirects unknown ids; the fallback only covers the redirect's render.
	const tab = (tabId ? findVizTab(tabId) : undefined) ?? firstVizTab();
	const source = useVizSource();
	const world = useWorld();
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

	// Aggregating 30k rows is the expensive part: once per data or filter change.
	const data = useMemo(() => {
		if (source.status !== "ready") return null;
		const trips = source.trips.filter((trip) => selected.has(trip.id));
		return buildVizData(splitRowsByTrips(source.rows, trips));
	}, [source, selected]);

	if (source.status === "error") {
		return (
			<Stack>
				<Header />
				<p role="alert">Could not read your data: {source.message}</p>
			</Stack>
		);
	}

	if (source.status === "loading" || !data) {
		return (
			<Stack>
				<Header />
				<p>Loading…</p>
			</Stack>
		);
	}

	if (source.rows.length === 0) {
		return (
			<Stack>
				<Header />
				<EmptyState
					art={<PixelArt name="plane" scale={4} />}
					title="No locations yet"
				>
					<p>
						Charts are drawn from your photo locations.{" "}
						<Link to="/import">Import the location CSV</Link> first.
					</p>
				</EmptyState>
			</Stack>
		);
	}

	const ctx = { rows: source.rows, trips: source.trips, data, world };
	if (!tab.usesTripFilter) {
		return (
			<Stack>
				<Header />
				{tab.render(ctx)}
			</Stack>
		);
	}

	return (
		<Stack>
			<Header />
			<TripFilter
				trips={source.trips}
				selected={selected}
				onChange={setSelected}
			/>
			<StatGroup>
				<Stat
					label={data.countries.length === 1 ? "Country" : "Countries"}
					value={data.countries.length}
				/>
				<Stat label="Photos" value={formatInt(data.photoCount)} />
				<Stat
					label="Days with photos"
					value={formatInt(Object.keys(data.dayCounts).length)}
				/>
				<Stat label="Periods" value={data.movements.length} />
			</StatGroup>
			{data.photoCount === 0 ? (
				<p className="vp-viz-muted">
					No photos fall inside the selected trips.
				</p>
			) : null}
			{tab.render(ctx)}
		</Stack>
	);
}
