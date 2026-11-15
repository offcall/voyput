import { buildYearRows, staysRange, yearRange } from "@voyput/core";
import { Button, EmptyState, PixelArt } from "@voyput/ui";
import { useMemo, useState } from "react";
import { ChartPanel } from "../ChartPanel";
import { CalendarChart } from "../charts/CalendarChart";
import { StayCalendar } from "../explore/StayCalendar";
import { StayTimeline } from "../explore/StayTimeline";
import { useSelection } from "../explore/useSelection";
import type { InsightsContext } from "../InsightsPage";

/** Nothing passes the filter: say so once, with a way back. */
export function NoMatch({ onReset }: { onReset: () => void }) {
	return (
		<EmptyState
			art={<PixelArt name="globe" scale={4} />}
			title="Nothing matches this filter"
			action={
				<Button variant="primary" onClick={onReset}>
					Clear filter
				</Button>
			}
		>
			<p>Widen the date range or remove a filter.</p>
		</EmptyState>
	);
}

/** Calendar: the stays year by year, one year day by day, and photos per day. */
export function CalendarView({ ctx }: { ctx: InsightsContext }) {
	const { filtered: rows, groups, filters, onFilter, stays, data, have } = ctx;
	const [calendarYear, setCalendarYear] = useState<number | null>(null);
	const selection = useSelection({ rows, groups, filters, onFilter });
	const [dataFrom, dataTo] = staysRange(stays.stays);
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
	const pickYear = (year: number) => {
		onFilter(yearRange(year, stays.stays));
		setCalendarYear(year);
	};

	if (rows.length === 0) return <NoMatch onReset={ctx.onReset} />;
	return (
		<div className="vp-explore">
			<ChartPanel
				title="Timeline"
				description="Each stay as a bar; a diamond is a one-day stay. Click a year to zoom in."
			>
				<StayTimeline
					rows={rows}
					selectedId={selection.selectedStayId}
					onPick={selection.pickStay}
					onYear={pickYear}
				/>
			</ChartPanel>
			<ChartPanel
				title="Days"
				description="Where you were each day of the year."
			>
				<StayCalendar
					rows={rows}
					years={years}
					year={shownYear}
					onYear={setCalendarYear}
					selectedId={selection.selectedStayId}
					onPick={selection.pickStay}
				/>
			</ChartPanel>
			{have.locations > 0 ? (
				<ChartPanel title="Photos" description="Photos per month and per day.">
					<CalendarChart data={data} />
				</ChartPanel>
			) : null}
			{selection.detail}
		</div>
	);
}
