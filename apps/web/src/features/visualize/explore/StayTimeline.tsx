import {
	buildStayTimeline,
	type FilteredStay,
	MONTH_LABELS,
} from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";

const pct = (fraction: number) => `${fraction * 100}%`;

/** One lane per year; each stay is a bar in its country's colour, one-day stays a diamond. */
export function StayTimeline({
	rows,
	selectedId,
	onPick,
	onYear,
}: {
	rows: readonly FilteredStay[];
	selectedId: string | null;
	onPick: (stay: FilteredStay) => void;
	onYear: (year: number) => void;
}) {
	const colourOf = useCountryColour();
	const lanes = buildStayTimeline(rows);
	return (
		<div className="vp-explore-timeline">
			<div className="vp-explore-timeline-axis" aria-hidden="true">
				<span />
				<div>
					{MONTH_LABELS.map((m) => (
						<span key={m}>{m}</span>
					))}
				</div>
			</div>
			{lanes.map((lane) => (
				<div key={lane.year} className="vp-explore-lane">
					<button
						type="button"
						className="vp-explore-lane-year"
						onClick={() => onYear(lane.year)}
						aria-label={`Show ${lane.year}`}
					>
						{lane.year}
					</button>
					<div className="vp-explore-lane-track">
						{lane.bars.map((bar) => (
							<button
								key={bar.stay.id}
								type="button"
								className="vp-explore-period"
								data-one-day={bar.oneDay || undefined}
								data-estimated={bar.stay.estimated || undefined}
								aria-pressed={selectedId === bar.stay.id}
								title={`${bar.stay.country} · ${bar.stay.start} – ${bar.stay.end}`}
								aria-label={`${bar.stay.country}, ${bar.stay.start} to ${bar.stay.end}`}
								style={{
									left: pct(bar.left),
									width: bar.oneDay ? undefined : pct(bar.width),
									backgroundColor: colourOf(bar.stay.countryCode),
								}}
								onClick={() => onPick(bar.stay)}
							/>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
