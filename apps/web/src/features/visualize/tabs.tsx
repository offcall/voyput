import type { LocationRow, VizData, WorldShapes } from "@voyput/core";
import { PixelArt, type SpriteName } from "@voyput/ui";
import type { ReactNode } from "react";
import { ChartPanel } from "./ChartPanel";
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
import type { StaysData } from "./data/useStays";
import { ExploreTab } from "./explore/ExploreTab";
import type { VizHave, VizNeed } from "./needs";
import { RouteTab } from "./route/RouteTab";

/** What a tab gets to draw from; the Visualize layout loads it once for all tabs. */
export interface VizTabContext {
	/** Every stored location row, unfiltered. */
	rows: readonly LocationRow[];
	/** Aggregates of the rows inside the selected stays (all rows when none is selected). */
	data: VizData;
	/** World outlines, or `null` until loaded. */
	world: WorldShapes | null;
	/** Stays, stored or suggested, for the stay views. */
	stays: StaysData;
	/** How much data there is; `needs` are checked against it. */
	have: VizHave;
}

export interface VizTab {
	/** URL segment: `/visualize/<id>`. */
	id: string;
	label: string;
	/** Small decorative icon for the nav. */
	icon?: ReactNode;
	/** Shows the stay filter and summary tiles above the tab; `false` gives the tab the full width. */
	usesStayFilter: boolean;
	/** Data the tab cannot draw without; when some is missing the layout shows a placeholder instead. Defaults to `["locations"]`. */
	needs?: readonly VizNeed[];
	render: (ctx: VizTabContext) => ReactNode;
}

/** A tab that shows one chart in a card, under the stay filter. */
function chartTab(
	id: string,
	label: string,
	panel: { title: string; sprite: SpriteName; description: string },
	chart: (ctx: VizTabContext) => ReactNode,
): VizTab {
	return {
		id,
		label,
		icon: <PixelArt name={panel.sprite} scale={1} />,
		usesStayFilter: true,
		needs: ["locations"],
		render: (ctx) => (
			<ChartPanel
				title={panel.title}
				sprite={panel.sprite}
				description={panel.description}
			>
				{chart(ctx)}
			</ChartPanel>
		),
	};
}

/** The Visualize tabs in nav order; `/visualize` opens the first one. */
export const VIZ_TABS: readonly VizTab[] = [
	{
		id: "route",
		label: "Route",
		icon: <PixelArt name="plane" scale={1} />,
		usesStayFilter: false,
		needs: ["stays"],
		render: ({ stays, have }) => <RouteTab data={stays} have={have} />,
	},
	{
		id: "explore",
		label: "Explore",
		icon: <PixelArt name="suitcase" scale={1} />,
		usesStayFilter: false,
		needs: ["stays"],
		render: ({ stays }) => <ExploreTab stays={stays.stays} />,
	},
	chartTab(
		"movements",
		"Periods",
		{
			title: "Country periods",
			sprite: "passport",
			description: "Each run of days in one country, in order.",
		},
		({ data }) => <MovementsTable data={data} />,
	),
	chartTab(
		"countries",
		"Countries",
		{
			title: "Countries",
			sprite: "stamp",
			description: "Where your photos were taken, most first.",
		},
		({ data }) => <CountriesTable data={data} />,
	),
	chartTab(
		"map",
		"Map",
		{
			title: "Route map",
			sprite: "plane",
			description: "Visited countries and the moves between them.",
		},
		({ data, world }) => <MapChart data={data} world={world} />,
	),
	chartTab(
		"heatmap",
		"Heatmap",
		{ title: "Heatmap", sprite: "sun", description: "Where photos pile up." },
		({ data, world }) => <HeatmapChart data={data} world={world} />,
	),
	chartTab(
		"globe",
		"Globe",
		{
			title: "Globe",
			sprite: "globe",
			description: "Photo spots and moves on a turning globe.",
		},
		({ data, world }) => <GlobeChart data={data} world={world} />,
	),
	chartTab(
		"matrix",
		"Year × country",
		{
			title: "Year × country",
			sprite: "suitcase",
			description: "Photos per country in each year.",
		},
		({ data }) => <MatrixChart data={data} />,
	),
	chartTab(
		"calendar",
		"Calendar",
		{
			title: "Calendar",
			sprite: "star",
			description: "Photos per month and per day.",
		},
		({ data }) => <CalendarChart data={data} />,
	),
	chartTab(
		"sankey",
		"Moves",
		{
			title: "Moves",
			sprite: "plane",
			description: "Where you left from and where you went.",
		},
		({ data }) => <SankeyChart data={data} />,
	),
	chartTab(
		"donut",
		"Years",
		{
			title: "Years",
			sprite: "trophy",
			description: "Share of photos by country, one ring per year.",
		},
		({ data }) => <DonutChart data={data} />,
	),
	chartTab(
		"distance",
		"Distance",
		{
			title: "Distance",
			sprite: "suitcase",
			description: "How far you went between photos.",
		},
		({ data }) => <DistanceChart data={data} />,
	),
];

/** The tab `/visualize` and unknown tab ids redirect to. */
export function firstVizTab(): VizTab {
	const first = VIZ_TABS[0];
	if (!first) throw new Error("The Visualize tab registry is empty");
	return first;
}

export function findVizTab(id: string): VizTab | undefined {
	return VIZ_TABS.find((tab) => tab.id === id);
}
