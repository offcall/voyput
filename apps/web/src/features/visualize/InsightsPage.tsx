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
	splitRowsByRanges,
	staysRange,
	summarizeStays,
	type VizData,
	type WorldShapes,
} from "@voyput/core";
import { PageHeader, Stack } from "@voyput/ui";
import { type ReactNode, useMemo, useState } from "react";
import { KeepCountryColours } from "../../app/countryColours";
import { type StaysData, useStays } from "./data/useStays";
import { activeFilterChips } from "./filterChips";
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

/** What a view gets to draw from; the Insights layout loads it once for all views. */
export interface InsightsContext {
	/** Every stored location row, unfiltered. */
	rows: readonly LocationRow[];
	/** Aggregates of the photos inside the filtered stays (all photos without a filter). */
	data: VizData;
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
};

/** Data each view cannot draw without. */
const NEEDS: Record<InsightViewId, readonly VizNeed[]> = {
	journey: ["stays"],
	map: ["locations"],
	calendar: ["stays"],
	stats: ["stays"],
};

/** Countries that keep their own colour; the rest share one neutral tone. */
const COLOURED_COUNTRIES = 10;

const VIEWS: Record<InsightViewId, (ctx: InsightsContext) => ReactNode> = {
	journey: (ctx) => <JourneyView stays={ctx.stays} world={ctx.world} />,
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
	const data = useMemo(() => {
		if (source.status !== "ready") return null;
		if (!isFiltered) return buildVizData([source.rows]);
		// Photos inside the filtered stays; layovers only when transits are asked for.
		const ranges = filtered
			.filter((s) => filters.kind === "transit" || s.kind !== "transit")
			.map((s) => ({ start: s.clipStart, end: s.clipEnd }));
		return buildVizData(
			ranges.length > 0 ? splitRowsByRanges(source.rows, ranges) : [],
		);
	}, [source, isFiltered, filtered, filters.kind]);

	const needs = NEEDS[view.id];
	const needsStays = needs.includes("stays");
	const header = (actions?: ReactNode) => (
		<PageHeader
			title={view.title}
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
		!data
	)
		return loading;

	const staysData = stays.status === "ready" ? stays.data : NO_STAYS;
	const have: VizHave = {
		locations: source.rows.length,
		stays: staysData.stays.length,
		storedStays: source.stays.length,
		stamps: source.stamps,
	};
	const missing = missingNeed(needs, have);
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
	const canFilter = view.id !== "journey" && staysData.stays.length > 0;
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
