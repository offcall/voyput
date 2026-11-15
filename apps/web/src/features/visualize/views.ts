/** The Insights views in nav order; `/insights` opens the first one. */
export const INSIGHT_VIEWS = [
	{
		id: "journey",
		label: "Journey",
		title: "Journey",
		subtitle: "Your travels replayed in order, stop by stop.",
	},
	{
		id: "map",
		label: "Map",
		title: "Map",
		subtitle: "Where you went, flat, as a heatmap or on a globe.",
	},
	{
		id: "calendar",
		label: "Calendar",
		title: "Calendar",
		subtitle: "Where you were, year by year and day by day.",
	},
	{
		id: "stats",
		label: "Stats",
		title: "Stats",
		subtitle: "Countries, years, moves and every stay in numbers.",
	},
] as const;

export type InsightView = (typeof INSIGHT_VIEWS)[number];
export type InsightViewId = InsightView["id"];

export const FIRST_VIEW: InsightViewId = "journey";

export function findView(id: string): InsightView | undefined {
	return INSIGHT_VIEWS.find((view) => view.id === id);
}

/** Map styles: one view, three ways to draw it. */
export const MAP_MODES = ["flat", "heat", "globe"] as const;
export type MapMode = (typeof MAP_MODES)[number];

export const isMapMode = (value: unknown): value is MapMode =>
	MAP_MODES.some((mode) => mode === value);

/** Sections of the Stats page, in page order; each is an anchor (`#moves`). */
export const STATS_SECTIONS = [
	{ id: "countries", label: "Countries" },
	{ id: "years", label: "Years" },
	{ id: "moves", label: "Moves" },
	{ id: "periods", label: "Periods" },
	{ id: "distance", label: "Distance" },
	{ id: "records", label: "Records" },
] as const;

export type StatsSectionId = (typeof STATS_SECTIONS)[number]["id"];

/** Where an old `/visualize/<tab>` now lives. */
export interface LegacyTarget {
	view: InsightViewId;
	mode?: MapMode;
	section?: StatsSectionId;
}

const LEGACY_TABS: Readonly<Record<string, LegacyTarget>> = {
	route: { view: "journey" },
	explore: { view: "stats" },
	movements: { view: "stats", section: "periods" },
	countries: { view: "stats", section: "countries" },
	map: { view: "map", mode: "flat" },
	heatmap: { view: "map", mode: "heat" },
	globe: { view: "map", mode: "globe" },
	matrix: { view: "stats", section: "years" },
	calendar: { view: "calendar" },
	sankey: { view: "stats", section: "moves" },
	donut: { view: "stats", section: "years" },
	distance: { view: "stats", section: "distance" },
};

/** The new home of an old Visualize tab; unknown tabs go to the first view. */
export function legacyTarget(tab: string | undefined): LegacyTarget {
	return (tab ? LEGACY_TABS[tab] : undefined) ?? { view: FIRST_VIEW };
}
