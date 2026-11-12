import type { Trip, TripStop } from "@voyput/core";
import { Badge } from "@voyput/ui";
import {
	colorOf,
	dayCount,
	daysIn,
	plural,
	rangeText,
	tripCountries,
} from "./format";
import { StatusBadge } from "./StatusBadge";
import { TripChip } from "./TripChip";

/** Longer trips get no strip; the squares would be too thin to read. */
const MAX_STRIP_DAYS = 400;

/** One square per day, coloured by the countries of that day's stops. */
function DayStrip({ trip }: { trip: Trip }) {
	if (dayCount(trip.start, trip.end) > MAX_STRIP_DAYS) return null;
	const days = daysIn(trip.start, trip.end);
	const byDay = new Map<string, TripStop[]>();
	for (const s of trip.stops)
		byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
	return (
		<div className="vp-trips-strip" aria-hidden="true">
			{days.map((day) => {
				const stops = byDay.get(day) ?? [];
				return (
					<span key={day} className="vp-trips-strip-day" title={day}>
						{stops.length === 0 ? (
							<span className="vp-trips-strip-empty" />
						) : (
							stops.map((s) => (
								<span
									key={s.id}
									style={{ background: colorOf(s.countryCode) }}
								/>
							))
						)}
					</span>
				);
			})}
		</div>
	);
}

export function TripCard({
	trip,
	stored,
	photos,
	problems,
	selected,
	onSelect,
}: {
	trip: Trip;
	stored: boolean;
	/** Photos taken abroad during the trip. */
	photos: number;
	/** Linked stamps that changed or disagree with photos. */
	problems: number;
	selected: boolean;
	onSelect: () => void;
}) {
	const cities = [...new Set(trip.stops.flatMap((s) => s.cities))];
	return (
		<article
			className="vp-trips-card"
			data-selected={selected || undefined}
			data-status={
				problems ? "problem" : trip.confirmed ? "confirmed" : "suggested"
			}
		>
			<div className="vp-trips-card-head">
				<div className="vp-trips-chips">
					{tripCountries(trip.stops).map((cc) => (
						<TripChip key={cc} code={cc} />
					))}
				</div>
				<div className="vp-trips-card-badges">
					{problems ? (
						<Badge tone="bad">{plural(problems, "issue")}</Badge>
					) : null}
					<StatusBadge confirmed={trip.confirmed} stored={stored} />
				</div>
			</div>
			<button
				type="button"
				className="vp-trips-card-title"
				onClick={onSelect}
				aria-pressed={selected}
			>
				{trip.title}
			</button>
			<div className="vp-trips-card-dates">
				{rangeText(trip.start, trip.end)}
				<span className="vp-trips-dot">·</span>
				{plural(dayCount(trip.start, trip.end), "day")}
			</div>
			<DayStrip trip={trip} />
			<div className="vp-trips-card-foot">
				<span className="vp-trips-evidence" title="Stamps in this trip">
					<StampIcon /> {trip.stampIds.length}
				</span>
				<span className="vp-trips-evidence" title="Photos taken abroad">
					<PhotoIcon /> {photos}
				</span>
				{cities.length ? (
					<span className="vp-trips-card-cities">{cities.join(", ")}</span>
				) : null}
			</div>
		</article>
	);
}

export function StampIcon() {
	return (
		<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
			<rect
				x="4"
				y="4"
				width="16"
				height="16"
				rx="3"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<path
				d="M8 12.5l2.5 2.5L16 9"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function PhotoIcon() {
	return (
		<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
			<rect
				x="3.5"
				y="5.5"
				width="17"
				height="13"
				rx="2.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<circle cx="9" cy="10.5" r="1.6" fill="currentColor" />
			<path
				d="M4.5 17.5l5-5 3 3 3.5-3.5 4.5 4.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
