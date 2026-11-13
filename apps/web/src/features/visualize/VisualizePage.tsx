import { useParams } from "@tanstack/react-router";
import {
	buildVizData,
	splitRowsByTrips,
	summarizeStays,
	withoutTransitRows,
} from "@voyput/core";
import { PageHeader, PixelArt, Stack, Stat, StatGroup } from "@voyput/ui";
import { type ReactNode, useMemo, useState } from "react";
import { formatInt } from "./charts/format";
import { type StaysData, useStays } from "./data/useStays";
import { missingNeed, VizEmpty, type VizHave, VizHint } from "./needs";
import { TripFilter } from "./TripFilter";
import { findVizTab, firstVizTab, type VizTab } from "./tabs";
import { useVizSource } from "./useVizSource";
import { useWorld } from "./useWorld";
import "./visualize.css";

/** Stays for tabs that do not draw trips, while the real ones load or after they failed. */
const NO_STAYS: StaysData = {
	stays: [],
	locations: [],
	trips: [],
	home: null,
	summary: summarizeStays([], []),
};

const Loading = () => <p>Loading…</p>;

function Layout({ children }: { children: ReactNode }) {
	return (
		<Stack>
			<PageHeader
				title="Visualize"
				description="Your travels drawn from photo locations: where, when and how far."
				art={<PixelArt name="globe" scale={4} />}
			/>
			{children}
		</Stack>
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
	const stays = useStays();
	const world = useWorld();
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

	// Aggregating 30k rows is the expensive part: once per data or filter change.
	const data = useMemo(() => {
		if (source.status !== "ready") return null;
		const trips = source.trips.filter((trip) => selected.has(trip.id));
		// A trip's photos leave out its layovers; all data stays all data.
		const rows =
			trips.length > 0
				? withoutTransitRows(source.rows, source.stays)
				: source.rows;
		return buildVizData(splitRowsByTrips(rows, trips));
	}, [source, selected]);

	// Only tabs that draw trips wait for the stays (or fail with them).
	const needs = tab.needs ?? ["locations"];
	const needsStays = needs.includes("trips");
	if (source.status === "error" || (needsStays && stays.status === "error")) {
		const message =
			source.status === "error"
				? source.message
				: stays.status === "error"
					? stays.message
					: "";
		return (
			<Layout>
				<p role="alert">Could not read your data: {message}</p>
			</Layout>
		);
	}

	if (
		source.status === "loading" ||
		(needsStays && stays.status === "loading") ||
		!data
	) {
		return (
			<Layout>
				<Loading />
			</Layout>
		);
	}

	const staysData = stays.status === "ready" ? stays.data : NO_STAYS;
	const have: VizHave = {
		locations: source.rows.length,
		trips: staysData.stays.length > 0 ? staysData.trips.length : 0,
		storedTrips: source.trips.length,
	};
	const missing = missingNeed(needs, have);
	if (missing) {
		// The placeholder names the trips there are, so it waits for them.
		if (stays.status === "loading")
			return (
				<Layout>
					<Loading />
				</Layout>
			);
		return (
			<Layout>
				<VizEmpty need={missing} have={have} />
			</Layout>
		);
	}

	const ctx = {
		rows: source.rows,
		trips: source.trips,
		data,
		world,
		stays: staysData,
		have,
	};
	if (!tab.usesTripFilter) {
		return (
			<Layout>
				<SuggestedTripsHint tab={tab} have={have} />
				{tab.render(ctx)}
			</Layout>
		);
	}

	return (
		<Layout>
			{have.storedTrips === 0 ? (
				<VizHint step="trips" label="Build trips">
					Save trips to filter these charts by journey.
				</VizHint>
			) : (
				<TripFilter
					trips={source.trips}
					selected={selected}
					onChange={setSelected}
				/>
			)}
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
		</Layout>
	);
}

/** Stay views drawn only from suggested trips say so, since nothing there is confirmed yet. */
function SuggestedTripsHint({ tab, have }: { tab: VizTab; have: VizHave }) {
	if (!tab.needs?.includes("trips") || have.storedTrips > 0) return null;
	return (
		<VizHint step="trips" label="Check trips">
			These trips are suggestions from your stamps and photos.
		</VizHint>
	);
}
