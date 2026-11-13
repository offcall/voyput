import { Link } from "@tanstack/react-router";
import { buildVizData, splitRowsByTrips } from "@voyput/core";
import {
	EmptyState,
	PageHeader,
	PixelArt,
	type SpriteName,
	Stack,
	Stat,
	StatGroup,
	type TabItem,
	Tabs,
} from "@voyput/ui";
import { type ReactNode, useMemo, useState } from "react";
import { ChartPanel } from "./ChartPanel";
import { CalendarChart } from "./charts/CalendarChart";
import { CountriesTable } from "./charts/CountriesTable";
import { DistanceChart } from "./charts/DistanceChart";
import { DonutChart } from "./charts/DonutChart";
import { formatInt } from "./charts/format";
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

	const panel = (
		title: string,
		sprite: SpriteName,
		description: string,
		chart: ReactNode,
	) => (
		<ChartPanel title={title} sprite={sprite} description={description}>
			{chart}
		</ChartPanel>
	);
	const tabs: TabItem[] = [
		{
			value: "movements",
			label: "Periods",
			content: panel(
				"Country periods",
				"passport",
				"Each run of days in one country, in order.",
				<MovementsTable data={data} />,
			),
		},
		{
			value: "countries",
			label: "Countries",
			content: panel(
				"Countries",
				"stamp",
				"Where your photos were taken, most first.",
				<CountriesTable data={data} />,
			),
		},
		{
			value: "map",
			label: "Route map",
			content: panel(
				"Route map",
				"plane",
				"Visited countries and the moves between them.",
				<MapChart data={data} world={world} />,
			),
		},
		{
			value: "heatmap",
			label: "Heatmap",
			content: panel(
				"Heatmap",
				"sun",
				"Where photos pile up.",
				<HeatmapChart data={data} world={world} />,
			),
		},
		{
			value: "globe",
			label: "Globe",
			content: panel(
				"Globe",
				"globe",
				"Photo spots and moves on a turning globe.",
				<GlobeChart data={data} world={world} />,
			),
		},
		{
			value: "matrix",
			label: "Year × country",
			content: panel(
				"Year × country",
				"suitcase",
				"Photos per country in each year.",
				<MatrixChart data={data} />,
			),
		},
		{
			value: "calendar",
			label: "Calendar",
			content: panel(
				"Calendar",
				"star",
				"Photos per month and per day.",
				<CalendarChart data={data} />,
			),
		},
		{
			value: "sankey",
			label: "Moves",
			content: panel(
				"Moves",
				"plane",
				"Where you left from and where you went.",
				<SankeyChart data={data} />,
			),
		},
		{
			value: "donut",
			label: "Years",
			content: panel(
				"Years",
				"trophy",
				"Share of photos by country, one ring per year.",
				<DonutChart data={data} />,
			),
		},
		{
			value: "distance",
			label: "Distance",
			content: panel(
				"Distance",
				"suitcase",
				"How far you went between photos.",
				<DistanceChart data={data} />,
			),
		},
	];

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
			<Tabs items={tabs} />
		</Stack>
	);
}
