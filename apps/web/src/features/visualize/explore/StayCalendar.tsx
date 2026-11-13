import {
	buildStayCalendar,
	type FilteredStay,
	WEEKDAY_LABELS,
} from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { Chip, ChipGroup } from "./Chip";

/** Twelve month grids of one year; a day takes the colour of the stay that covers it. */
export function StayCalendar({
	rows,
	years,
	year,
	onYear,
	selectedId,
	onPick,
}: {
	rows: readonly FilteredStay[];
	years: readonly number[];
	year: number;
	onYear: (year: number) => void;
	selectedId: string | null;
	onPick: (stay: FilteredStay) => void;
}) {
	const colourOf = useCountryColour();
	const months = buildStayCalendar(rows, year);
	return (
		<>
			{years.length > 1 ? (
				<ChipGroup label="Calendar year">
					{years.map((y) => (
						<Chip key={y} selected={y === year} onClick={() => onYear(y)}>
							{y}
						</Chip>
					))}
				</ChipGroup>
			) : null}
			<div className="vp-explore-calendar">
				{months.map((month) => (
					<section key={month.month} className="vp-explore-month">
						<h3>
							{month.label} {year}
						</h3>
						<div className="vp-explore-days">
							{WEEKDAY_LABELS.map((d) => (
								<small key={d} aria-hidden="true">
									{d[0]}
								</small>
							))}
							{Array.from({ length: month.offset }, (_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: blank cells have no identity.
								<span key={`blank-${i}`} className="vp-explore-day" />
							))}
							{month.days.map((day) => {
								const stay =
									day.stays.find((s) => s.countryCode === day.countryCode) ??
									null;
								if (!stay)
									return (
										<span key={day.date} className="vp-explore-day">
											{day.day}
										</span>
									);
								return (
									<button
										key={day.date}
										type="button"
										className="vp-explore-day"
										data-one-day={day.oneDay || undefined}
										aria-pressed={day.stays.some((s) => s.id === selectedId)}
										title={`${day.date}: ${day.stays.map((s) => s.country).join(", ")}`}
										aria-label={`${day.date}, ${stay.country}`}
										style={{ background: colourOf(stay.countryCode) }}
										onClick={() => onPick(stay)}
									>
										{day.day}
									</button>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</>
	);
}
