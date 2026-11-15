import { useRouterState } from "@tanstack/react-router";
import {
	buildStayRoutes,
	buildYearRows,
	durationBars,
	entryMethodBars,
	exploreKpis,
	firstVisits,
	longestStayBars,
	staysRange,
	yearRange,
} from "@voyput/core";
import { flagEmoji, Stat, StatGroup } from "@voyput/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChartPanel } from "../ChartPanel";
import { CountriesTable } from "../charts/CountriesTable";
import { DistanceChart } from "../charts/DistanceChart";
import { DonutChart } from "../charts/DonutChart";
import { formatInt } from "../charts/format";
import { MatrixChart } from "../charts/MatrixChart";
import { MovementsTable } from "../charts/MovementsTable";
import { SankeyChart } from "../charts/SankeyChart";
import { BarList } from "../explore/BarList";
import { Chip, ChipGroup } from "../explore/Chip";
import { CountryScatter } from "../explore/CountryScatter";
import { StayRecords } from "../explore/StayRecords";
import { useSelection } from "../explore/useSelection";
import { YearRegions } from "../explore/YearRegions";
import type { InsightsContext } from "../InsightsPage";
import { STATS_SECTIONS, type StatsSectionId } from "../views";
import { NoMatch } from "./CalendarView";

function Section({
	id,
	title,
	children,
}: {
	id: StatsSectionId;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className="vp-insights-section"
			aria-labelledby={`${id}-title`}
		>
			<h2 id={`${id}-title`} className="vp-insights-section-title">
				{title}
			</h2>
			{children}
		</section>
	);
}

/** Opens at the section in the URL hash (old tab links land there). */
function useScrollToHash() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	useEffect(() => {
		if (!hash) return;
		const target = document.getElementById(hash);
		if (typeof target?.scrollIntoView === "function")
			target.scrollIntoView({ block: "start" });
	}, [hash]);
}

const NEEDS_STAYS = <p className="vp-viz-muted">Drawn from stays.</p>;

const NEEDS_PHOTOS = (
	<p className="vp-viz-muted">Drawn from photo locations.</p>
);

/**
 * Stats: key numbers on top, then one scrolling page of sections with an
 * in-page nav. Stay sections follow the filter; photo sections show the
 * photos inside the filtered stays.
 */
export function StatsView({ ctx }: { ctx: InsightsContext }) {
	const { filtered: rows, groups, filters, onFilter, stays, data, have } = ctx;
	const selection = useSelection({ rows, groups, filters, onFilter });
	const [rankBy, setRankBy] = useState<"days" | "visits">("days");
	useScrollToHash();
	const kpis = exploreKpis(rows);
	const [dataFrom, dataTo] = staysRange(stays.stays);
	const from = filters.from || dataFrom;
	const to = filters.to || dataTo;
	const yearRows = useMemo(
		() => buildYearRows(rows, from, to),
		[rows, from, to],
	);
	const photos = have.locations > 0;
	const pickYear = (year: number) => onFilter(yearRange(year, stays.stays));

	// Stay sections need drawable stays, photo sections only photos.
	const hasStays = stays.stays.length > 0;
	if (hasStays && rows.length === 0) return <NoMatch onReset={ctx.onReset} />;
	return (
		<div className="vp-explore vp-insights-stats">
			<StatGroup>
				<Stat
					label="Countries"
					value={formatInt(hasStays ? kpis.countries : data.countries.length)}
				/>
				<Stat label="Stays" value={formatInt(kpis.stays)} />
				<Stat
					label="Days abroad"
					value={hasStays ? formatInt(kpis.daysAbroad) : "—"}
				/>
				<Stat
					label="Distance"
					value={photos ? `${formatInt(data.distances.totalKm)} km` : "—"}
				/>
			</StatGroup>

			<nav className="vp-insights-sections" aria-label="Sections of Stats">
				{STATS_SECTIONS.map((s) => (
					<a key={s.id} href={`#${s.id}`}>
						{s.label}
					</a>
				))}
			</nav>

			<Section id="countries" title="Countries">
				<div className="vp-explore-grid">
					{hasStays ? (
						<ChartPanel title="Top countries">
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
									bar.countryCode && selection.pickCountry(bar.countryCode)
								}
							/>
						</ChartPanel>
					) : null}
					{hasStays ? (
						<ChartPanel
							title="First visits"
							description="Countries whose very first stay falls in this selection."
						>
							<ul className="vp-insights-flags" aria-label="First visits">
								{firstVisits(stays.stays, rows).map((r) => (
									<li key={r.id}>
										<button
											type="button"
											title={`${r.country} · first visit ${r.start}`}
											aria-label={`${r.country}, first visit ${r.start}`}
											onClick={() => selection.pickStay(r)}
										>
											<span aria-hidden="true">{flagEmoji(r.countryCode)}</span>
											<span aria-hidden="true">{r.countryCode}</span>
										</button>
									</li>
								))}
							</ul>
						</ChartPanel>
					) : null}
					{hasStays ? (
						<ChartPanel
							title="Visits vs days"
							description="Countries you came back to, and where you stayed long."
						>
							<CountryScatter
								groups={groups}
								selected={selection.selectedCountry}
								onPick={selection.pickCountry}
							/>
						</ChartPanel>
					) : null}
					<ChartPanel
						title="Photos by country"
						description="Where your photos were taken, most first."
					>
						{photos ? <CountriesTable data={data} /> : NEEDS_PHOTOS}
					</ChartPanel>
				</div>
			</Section>

			<Section id="years" title="Years">
				<div className="vp-explore-grid">
					{hasStays ? (
						<ChartPanel
							title="Regions by year"
							description="How each year's days split across regions. Click a year to filter."
						>
							<YearRegions rows={yearRows} onYear={pickYear} />
						</ChartPanel>
					) : null}
					<ChartPanel
						title="Countries per year"
						description="Share of photos by country, one ring per year."
					>
						{photos ? <DonutChart data={data} /> : NEEDS_PHOTOS}
					</ChartPanel>
				</div>
				{photos ? (
					<ChartPanel
						title="Year × country"
						description="Photos per country in each year."
					>
						<MatrixChart data={data} />
					</ChartPanel>
				) : null}
			</Section>

			<Section id="moves" title="Moves">
				{photos ? (
					<ChartPanel
						title="Moves between countries"
						description="Where you left from and where you went, from photos."
					>
						<SankeyChart data={data} />
					</ChartPanel>
				) : null}
				{hasStays ? (
					<ChartPanel
						title="Stay to stay"
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
				) : null}
			</Section>

			<Section id="periods" title="Periods">
				<div className="vp-explore-grid">
					{hasStays ? (
						<ChartPanel
							title="Longest stays"
							description="Single stays by days in the range."
						>
							<BarList
								label="Longest stays"
								unit="d"
								bars={longestStayBars(rows)}
								onPick={(bar) => selection.pickStay(bar)}
							/>
						</ChartPanel>
					) : null}
					{hasStays ? (
						<ChartPanel
							title="Rhythm"
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
					) : null}
				</div>
				{photos ? (
					<ChartPanel
						title="Country periods"
						description="Each run of days in one country, from photos."
					>
						<MovementsTable data={data} />
					</ChartPanel>
				) : null}
			</Section>

			<Section id="distance" title="Distance">
				{photos ? (
					<ChartPanel
						title="Distance"
						description="How far you went between photos."
					>
						<DistanceChart data={data} />
					</ChartPanel>
				) : (
					NEEDS_PHOTOS
				)}
			</Section>

			<Section id="records" title="Records">
				{hasStays ? (
					<>
						<p className="vp-viz-muted" data-testid="record-facts">
							{formatInt(kpis.days)} days · {formatInt(kpis.oneDay)} one-day
							stays · {formatInt(kpis.transits)} transits ·{" "}
							{formatInt(kpis.estimated)} with estimated dates · longest{" "}
							{kpis.longest
								? `${formatInt(kpis.longest.clippedDays)} d (${kpis.longest.country})`
								: "—"}
						</p>
						<ChartPanel
							title="Every stay"
							description="Sort by a column, download as CSV."
						>
							<StayRecords
								rows={rows}
								selectedId={selection.selectedStayId}
								onPick={selection.pickStay}
							/>
						</ChartPanel>
					</>
				) : (
					NEEDS_STAYS
				)}
			</Section>

			{selection.detail}
		</div>
	);
}
