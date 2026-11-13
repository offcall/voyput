import { Link } from "@tanstack/react-router";
import {
	buildStayRoutes,
	buildYearRows,
	defaultExploreFilters,
	durationBars,
	entryMethodBars,
	exploreKpis,
	type FilteredStay,
	type ExploreFilters as Filters,
	filterStays,
	firstVisits,
	groupByCountry,
	longestStayBars,
	type Stay,
	staysRange,
	yearRange,
} from "@voyput/core";
import {
	Button,
	CountryChip,
	EmptyState,
	PixelArt,
	Stat,
	StatGroup,
} from "@voyput/ui";
import { useMemo, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { ChartPanel } from "../ChartPanel";
import { formatInt } from "../charts/format";
import { useStays } from "../data/useStays";
import { BarList } from "./BarList";
import { Chip, ChipGroup } from "./Chip";
import { CountryScatter } from "./CountryScatter";
import { CountryDetail, StayDetail } from "./ExploreDetail";
import { ExploreFilters } from "./ExploreFilters";
import { StayCalendar } from "./StayCalendar";
import { StayRecords } from "./StayRecords";
import { StayTimeline } from "./StayTimeline";
import { YearRegions } from "./YearRegions";
import "./explore.css";

type Selection =
	| { type: "stay"; id: string }
	| { type: "country"; code: string }
	| null;

/** `/visualize/explore`: loads the stays, then shows the dashboard. */
export function ExploreTab() {
	const source = useStays();
	if (source.status === "loading") return <p>Loading…</p>;
	if (source.status === "error")
		return <p role="alert">Could not read your trips: {source.message}</p>;
	if (source.data.stays.length === 0)
		return (
			<EmptyState
				art={<PixelArt name="suitcase" scale={4} />}
				title="No stays yet"
			>
				<p>
					Explore is built from your trips. <Link to="/trips">Open Trips</Link>{" "}
					to check or add some.
				</p>
			</EmptyState>
		);
	return <ExploreDashboard stays={source.data.stays} />;
}

/** Filter bar, KPIs and every stay view; filters live in component state. */
function ExploreDashboard({ stays }: { stays: readonly Stay[] }) {
	const colourOf = useCountryColour();
	const defaults = useMemo(() => defaultExploreFilters(stays), [stays]);
	const [filters, setFilters] = useState<Filters>(defaults);
	const [selection, setSelection] = useState<Selection>(null);
	const [calendarYear, setCalendarYear] = useState<number | null>(null);
	const [rankBy, setRankBy] = useState<"days" | "visits">("days");

	const rows = useMemo(() => filterStays(stays, filters), [stays, filters]);
	const groups = useMemo(() => groupByCountry(rows), [rows]);
	const kpis = exploreKpis(rows);
	// An emptied date field leaves that side open: fall back to the data's edge.
	const [dataFrom, dataTo] = staysRange(stays);
	const from = filters.from || dataFrom;
	const to = filters.to || dataTo;
	const yearRows = useMemo(
		() => buildYearRows(rows, from, to),
		[rows, from, to],
	);
	const years = yearRows.map((r) => r.year);
	const shownYear =
		calendarYear !== null && years.includes(calendarYear)
			? calendarYear
			: (years.at(-1) ?? Number(dataTo.slice(0, 4)));

	const update = (patch: Partial<Filters>) =>
		setFilters((f) => ({ ...f, ...patch }));
	const reset = () => {
		setFilters(defaults);
		setSelection(null);
	};
	const pickYear = (year: number) => {
		update(yearRange(year, stays));
		setCalendarYear(year);
	};
	const pickStay = (stay: FilteredStay) =>
		setSelection({ type: "stay", id: stay.id });
	const pickCountry = (code: string) => setSelection({ type: "country", code });
	const close = () => setSelection(null);

	const selectedStay =
		selection?.type === "stay"
			? (rows.find((r) => r.id === selection.id) ?? null)
			: null;
	const selectedCountry =
		selection?.type === "country"
			? (groups.find((g) => g.countryCode === selection.code) ?? null)
			: null;

	const scope = `${rows.length} of ${stays.length} stays · ${from} – ${to}`;

	return (
		<div className="vp-explore">
			<ExploreFilters
				stays={stays}
				filters={filters}
				defaults={defaults}
				onChange={update}
				onReset={reset}
				scope={scope}
			/>

			<StatGroup>
				<Stat label="Stays" value={formatInt(kpis.stays)} />
				<Stat label="Countries" value={formatInt(kpis.countries)} />
				<Stat label="Days" value={formatInt(kpis.days)} />
				<Stat label="Days abroad" value={formatInt(kpis.daysAbroad)} />
				<Stat label="One-day stays" value={formatInt(kpis.oneDay)} />
				<Stat label="Transits" value={formatInt(kpis.transits)} />
				<Stat label="Estimated" value={formatInt(kpis.estimated)} />
				<Stat
					label="Longest stay"
					value={kpis.longest ? `${kpis.longest.clippedDays} d` : "—"}
					hint={kpis.longest?.country}
				/>
			</StatGroup>

			{rows.length === 0 ? (
				<EmptyState
					art={<PixelArt name="globe" scale={4} />}
					title="Nothing matches these filters"
					action={
						<Button variant="primary" onClick={reset}>
							Reset filters
						</Button>
					}
				>
					<p>Widen the date range or clear a filter.</p>
				</EmptyState>
			) : (
				<>
					<ChartPanel
						title="Timeline"
						sprite="plane"
						description="Each stay as a bar in its country's colour; a diamond is a one-day stay. Click a year to zoom in."
					>
						<StayTimeline
							rows={rows}
							selectedId={selectedStay?.id ?? null}
							onPick={pickStay}
							onYear={pickYear}
						/>
					</ChartPanel>

					<ChartPanel
						title="Calendar"
						sprite="star"
						description="Where you were each day of the year."
					>
						<StayCalendar
							rows={rows}
							years={years}
							year={shownYear}
							onYear={setCalendarYear}
							selectedId={selectedStay?.id ?? null}
							onPick={pickStay}
						/>
					</ChartPanel>

					<div className="vp-explore-grid">
						<ChartPanel
							title="Top countries"
							sprite="trophy"
							description="Where you spent the most time, or went back most."
						>
							<ChipGroup label="Rank by">
								<Chip
									selected={rankBy === "days"}
									onClick={() => setRankBy("days")}
								>
									Days
								</Chip>
								<Chip
									selected={rankBy === "visits"}
									onClick={() => setRankBy("visits")}
								>
									Visits
								</Chip>
							</ChipGroup>
							<BarList
								label="Top countries"
								unit={rankBy === "days" ? "d" : "×"}
								bars={groups.map((g) => ({
									id: g.countryCode,
									label: g.country,
									value: g[rankBy],
									countryCode: g.countryCode,
								}))}
								onPick={(bar) =>
									bar.countryCode && pickCountry(bar.countryCode)
								}
							/>
						</ChartPanel>
						<ChartPanel
							title="Longest stays"
							sprite="suitcase"
							description="Single stays by days in the range."
						>
							<BarList
								label="Longest stays"
								unit="d"
								bars={longestStayBars(rows)}
								onPick={(bar) => setSelection({ type: "stay", id: bar.id })}
							/>
						</ChartPanel>
						<ChartPanel
							title="Visits vs days"
							sprite="globe"
							description="Countries you came back to, and where you stayed long."
						>
							<CountryScatter
								groups={groups}
								selected={selectedCountry?.countryCode ?? null}
								onPick={pickCountry}
							/>
						</ChartPanel>
						<ChartPanel
							title="Regions by year"
							sprite="sun"
							description="How each year's days split across regions."
						>
							<YearRegions rows={yearRows} onYear={pickYear} />
						</ChartPanel>
						<ChartPanel
							title="Routes"
							sprite="plane"
							description="Country changes from one stay straight into the next."
						>
							<BarList
								label="Routes"
								unit="×"
								bars={buildStayRoutes(rows).map((r) => ({
									id: `${r.from}>${r.to}`,
									label: r.label,
									value: r.count,
								}))}
							/>
						</ChartPanel>
						<ChartPanel
							title="Rhythm"
							sprite="stamp"
							description="Stays by full length, and how you entered."
						>
							<BarList
								label="Stays by length"
								unit="stays"
								keepOrder
								bars={durationBars(rows)}
							/>
							<h3 className="vp-viz-subtitle">Entry</h3>
							<BarList
								label="Stays by entry"
								unit="stays"
								bars={entryMethodBars(rows)}
							/>
						</ChartPanel>
					</div>

					<ChartPanel
						title="First visits"
						sprite="sparkle"
						description="Countries whose very first stay falls in this selection."
					>
						<ul className="vp-explore-firsts">
							{firstVisits(stays, rows).map((r) => (
								<li key={r.id}>
									<button type="button" onClick={() => pickStay(r)}>
										<CountryChip
											code={r.countryCode}
											name={r.country}
											colour={colourOf(r.countryCode)}
										/>
										<small>{r.start}</small>
									</button>
								</li>
							))}
						</ul>
					</ChartPanel>

					<ChartPanel
						title="Records"
						sprite="passport"
						description="Every stay in the selection. Sort by a column, download as CSV."
					>
						<StayRecords
							rows={rows}
							selectedId={selectedStay?.id ?? null}
							onPick={pickStay}
						/>
					</ChartPanel>
				</>
			)}

			{selectedStay ? (
				<StayDetail
					stay={selectedStay}
					onCountry={pickCountry}
					onClose={close}
				/>
			) : selectedCountry ? (
				<CountryDetail
					group={selectedCountry}
					visits={rows.filter(
						(r) => r.countryCode === selectedCountry.countryCode,
					)}
					filtered={
						filters.countries.length === 1 &&
						filters.countries[0] === selectedCountry.countryCode
					}
					onStay={pickStay}
					onFilter={() => update({ countries: [selectedCountry.countryCode] })}
					onClose={close}
				/>
			) : null}
		</div>
	);
}
