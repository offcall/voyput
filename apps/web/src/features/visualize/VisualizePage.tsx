import { Link } from "@tanstack/react-router";
import { buildVizData, splitRowsByTrips } from "@voyput/core";
import { Card, Stack, type TabItem, Tabs } from "@voyput/ui";
import { useMemo, useState } from "react";
import { CalendarChart } from "./charts/CalendarChart";
import { CountriesTable } from "./charts/CountriesTable";
import { DistanceChart } from "./charts/DistanceChart";
import { DonutChart } from "./charts/DonutChart";
import { GlobeChart } from "./charts/GlobeChart";
import { HeatmapChart } from "./charts/HeatmapChart";
import { MapChart } from "./charts/MapChart";
import { MatrixChart } from "./charts/MatrixChart";
import { MovementsTable } from "./charts/MovementsTable";
import { SankeyChart } from "./charts/SankeyChart";
import { TripFilter } from "./TripFilter";
import { useVizSource } from "./useVizSource";
import { useWorld } from "./useWorld";
import "./visualize.css";

export function VisualizePage() {
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
				<h1>Visualize</h1>
				<p role="alert">Could not read your data: {source.message}</p>
			</Stack>
		);
	}

	if (source.status === "loading" || !data) {
		return (
			<Stack>
				<h1>Visualize</h1>
				<p>Loading…</p>
			</Stack>
		);
	}

	if (source.rows.length === 0) {
		return (
			<Stack>
				<h1>Visualize</h1>
				<Card title="No locations yet">
					<p>
						Charts are drawn from your photo locations.{" "}
						<Link to="/import">Import the location CSV</Link> first.
					</p>
				</Card>
			</Stack>
		);
	}

	const tabs: TabItem[] = [
		{
			value: "movements",
			label: "Periods",
			content: <MovementsTable data={data} />,
		},
		{
			value: "countries",
			label: "Countries",
			content: <CountriesTable data={data} />,
		},
		{
			value: "map",
			label: "Route map",
			content: <MapChart data={data} world={world} />,
		},
		{
			value: "heatmap",
			label: "Heatmap",
			content: <HeatmapChart data={data} world={world} />,
		},
		{
			value: "globe",
			label: "Globe",
			content: <GlobeChart data={data} world={world} />,
		},
		{
			value: "matrix",
			label: "Year × country",
			content: <MatrixChart data={data} />,
		},
		{
			value: "calendar",
			label: "Calendar",
			content: <CalendarChart data={data} />,
		},
		{ value: "sankey", label: "Moves", content: <SankeyChart data={data} /> },
		{ value: "donut", label: "Years", content: <DonutChart data={data} /> },
		{
			value: "distance",
			label: "Distance",
			content: <DistanceChart data={data} />,
		},
	];

	return (
		<Stack>
			<h1>Visualize</h1>
			<TripFilter
				trips={source.trips}
				selected={selected}
				onChange={setSelected}
			/>
			<p className="vp-viz-summary">
				{data.countries.length}{" "}
				{data.countries.length === 1 ? "country" : "countries"} ·{" "}
				{data.photoCount.toLocaleString("en-US")} photos ·{" "}
				{data.movements.length} periods
			</p>
			{data.photoCount === 0 ? (
				<p className="vp-viz-muted">
					No photos fall inside the selected trips.
				</p>
			) : null}
			<Tabs items={tabs} />
		</Stack>
	);
}
