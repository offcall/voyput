import { useParams } from "@tanstack/react-router";
import {
	buildVizData,
	type CountryGroup,
	defaultExploreFilters,
	type FilteredStay,
	type ExploreFilters as Filters,
	filterStays,
	groupByCountry,
	type LocationRow,
	staysRange,
	summarizeStays,
	type VizData,
	type WorldShapes,
} from "@voyput/core";
import { SkyHeader, type SpriteName, Stack } from "@voyput/ui";
import { type ReactNode, useMemo, useState } from "react";
import { KeepCountryColours } from "../../app/countryColours";
import { localToday } from "../trips/format";
import { type StaysData, useStays } from "./data/useStays";
import { activeFilterChips } from "./filterChips";
import { photosInStays } from "./filterPhotos";
import { FilterBar, FilterButton } from "./InsightsFilter";
import {
	hintFor,
	InsightsHint,
	missingNeed,
	VizEmpty,
	type VizHave,
	type VizNeed,
} from "./needs";
import { useVizSource } from "./useVizSource";
import { useWorld } from "./useWorld";
import { findView, INSIGHT_VIEWS, type InsightViewId } from "./views";
import { CalendarView } from "./views/CalendarView";
import { JourneyView } from "./views/JourneyView";
import { MapView } from "./views/MapView";
import { StatsView } from "./views/StatsView";
import "./visualize.css";
import "./explore/explore.css";
import "./insights.css";

/** The sprite on each view's sky band. */
const VIEW_ART: Record<InsightViewId, SpriteName> = {
	journey: "plane",
	map: "globe",
	calendar: "stamp",
	stats: "trophy",
};

/** What a view gets to draw from; the Insights layout loads it once for all views. */
export interface InsightsContext {
	/** Every stored location row, unfiltered. */
	rows: readonly LocationRow[];
	/** Aggregates of the photos inside the filtered stays (all photos without a filter). */
	data: VizData;
	/** The photos `data` is built from. */
	photos: readonly LocationRow[];
	/** A filter is set (not the defaults). */
	isFiltered: boolean;
	/** World outlines, or `null` until loaded. */
	world: WorldShapes | null;
	/** Every stay, stored or suggested. */
	stays: StaysData;
	/** Stays that pass the filter, cut to its date range. */
	filtered: FilteredStay[];
	/** The filtered stays per country. */
	groups: CountryGroup[];
	filters: Filters;
	onFilter: (patch: Partial<Filters>) => void;
	onReset: () => void;
	have: VizHave;
}

/** Stays for views that do not draw stays, while the real ones load or after they failed. */
const NO_STAYS: StaysData = {
	stays: [],
	locations: [],
	birthCountry: null,
	summary: summarizeStays([]),
	history: [],
	birth: null,
};

/**
 * Data each view cannot draw without. Calendar and Stats draw stay sections
 * and photo sections apart, so either is enough; they still wait for stays.
 */
const NEEDS: Record<InsightViewId, readonly VizNeed[]> = {
	journey: ["stays"],
	map: ["locations"],
	calendar: [],
	stats: [],
};
const WAITS_FOR_STAYS: Record<InsightViewId, boolean> = {
	journey: true,
	map: false,
	calendar: true,
	stats: true,
};

/** Countries that keep their own colour; the rest share one neutral tone. */
const COLOURED_COUNTRIES = 10;

const VIEWS: Record<InsightViewId, (ctx: InsightsContext) => ReactNode> = {
	journey: (ctx) => <JourneyView ctx={ctx} />,
	map: (ctx) => <MapView ctx={ctx} />,
	calendar: (ctx) => <CalendarView ctx={ctx} />,
	stats: (ctx) => <StatsView ctx={ctx} />,
};

const sameFilters = (a: Filters, b: Filters) =>
	JSON.stringify(a) === JSON.stringify(b);

/**
 * The `/insights` layout: loads the data once and keeps the filter while the
 * `/insights/$view` child changes; the shell nav lists the views.
 */
export function InsightsPage() {
	const { view: viewId } = useParams({ strict: false });
	// The router redirects unknown ids; the fallback only covers the redirect's render.
	const view = (viewId ? findView(viewId) : undefined) ?? INSIGHT_VIEWS[0];
	const source = useVizSource();
	const stays = useStays();
	const world = useWorld();
	const [chosen, setChosen] = useState<Filters | null>(null);
	const [filterOpen, setFilterOpen] = useState(false);

	const allStays = stays.status === "ready" ? stays.data.stays : null;
	const defaults = useMemo(
		() => defaultExploreFilters(allStays ?? []),
		[allStays],
	);
	const filters = chosen ?? defaults;
	const isFiltered = !sameFilters(filters, defaults);
	const filtered = useMemo(
		() => filterStays(allStays ?? [], filters),
		[allStays, filters],
	);
	const groups = useMemo(() => groupByCountry(filtered), [filtered]);
	const keep = useMemo(() => {
		const all = groupByCountry(filterStays(allStays ?? [], defaults));
		return [...all]
			.sort((a, b) => b.days - a.days)
			.slice(0, COLOURED_COUNTRIES)
			.map((g) => g.countryCode);
	}, [allStays, defaults]);

	// Aggregating 30k rows is the expensive part: once per data or filter change.
	const photos = useMemo(() => {
		if (source.status !== "ready") return null;
		if (!isFiltered || stays.status !== "ready") return [source.rows];
		return photosInStays({
			rows: source.rows,
			filtered,
			history: stays.data.history,
			filters,
			birth: stays.data.birth,
			today: localToday(),
		});
	}, [source, stays, isFiltered, filtered, filters]);
	const data = useMemo(() => (photos ? buildVizData(photos) : null), [photos]);

	const needs = NEEDS[view.id];
	const needsStays = WAITS_FOR_STAYS[view.id];
	const header = (actions?: ReactNode) => (
		<SkyHeader
			title={view.title}
			art={VIEW_ART[view.id]}
			description={view.subtitle}
			actions={actions}
		/>
	);

	if (source.status === "error" || (needsStays && stays.status === "error")) {
		const message =
			source.status === "error"
				? source.message
				: stays.status === "error"
					? stays.message
					: "";
		return (
			<Stack>
				{header()}
				<p role="alert">Could not read your data: {message}</p>
			</Stack>
		);
	}

	const loading = (
		<Stack>
			{header()}
			<p>Loading…</p>
		</Stack>
	);
	if (
		source.status === "loading" ||
		(needsStays && stays.status === "loading") ||
		!data ||
		!photos
	)
		return loading;

	const staysData = stays.status === "ready" ? stays.data : NO_STAYS;
	const have: VizHave = {
		locations: source.rows.length,
		stays: staysData.stays.length,
		storedStays: source.stays.length,
		stamps: source.stamps,
	};
	const missing =
		missingNeed(needs, have) ??
		(have.locations === 0 && have.stays === 0 ? "stays" : null);
	if (missing) {
		// The placeholder names the stays there are, so it waits for them.
		if (stays.status === "loading") return loading;
		return (
			<Stack>
				{header()}
				<VizEmpty need={missing} have={have} />
			</Stack>
		);
	}

	const onFilter = (patch: Partial<Filters>) =>
		setChosen((prev) => ({ ...(prev ?? defaults), ...patch }));
	const onReset = () => setChosen(null);
	const canFilter = staysData.stays.length > 0;
	const [dataFrom, dataTo] = staysRange(staysData.stays);
	const scope = `${filtered.length} of ${staysData.stays.length} stays · ${filters.from || dataFrom} – ${filters.to || dataTo}`;
	const hint = hintFor(view.id, have);

	return (
		<Stack>
			{header(
				canFilter ? (
					<FilterButton
						open={filterOpen}
						active={
							activeFilterChips(filters, defaults, staysData.stays).length
						}
						onToggle={() => setFilterOpen(!filterOpen)}
					/>
				) : undefined,
			)}
			{canFilter ? (
				<FilterBar
					stays={staysData.stays}
					filters={filters}
					defaults={defaults}
					open={filterOpen}
					scope={scope}
					onChange={onFilter}
					onReset={onReset}
				/>
			) : null}
			{hint ? <InsightsHint hint={hint} /> : null}
			<KeepCountryColours keep={keep}>
				{VIEWS[view.id]({
					rows: source.rows,
					data,
					photos: photos.flat(),
					isFiltered,
					world,
					stays: staysData,
					filtered,
					groups,
					filters,
					onFilter,
					onReset,
					have,
				})}
			</KeepCountryColours>
		</Stack>
	);
}
