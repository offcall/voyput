import type { Trip } from "@voyput/core";
import { Badge } from "@voyput/ui";
import { colorOf, dayCount, plural, rangeText, tripCountries } from "./format";
import { StatusBadge } from "./StatusBadge";
import { stripBlocks } from "./strip";
import { TripChips } from "./TripChip";

/** Blocks of days, coloured by the countries of their stops. */
function DayStrip({ trip }: { trip: Trip }) {
	const blocks = stripBlocks(trip.start, trip.end, trip.stops);
	return (
		<div className="vp-trips-strip" aria-hidden="true">
			{blocks.map((block) => (
				<span
					key={block.from}
					className="vp-trips-strip-day"
					title={
						block.from === block.to ? block.from : `${block.from} – ${block.to}`
					}
				>
					{block.countries.length === 0 ? (
						<span className="vp-trips-strip-empty" />
					) : (
						block.countries.map((c) => (
							<span
								key={c.countryCode}
								style={{
									flexGrow: c.days,
									background: colorOf(c.countryCode),
								}}
							/>
						))
					)}
				</span>
			))}
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
	const days = dayCount(trip.start, trip.end);
	return (
		<article
			className="vp-trips-card"
			data-selected={selected || undefined}
			data-status={
				problems ? "problem" : trip.confirmed ? "confirmed" : "suggested"
			}
		>
			<span className="vp-trips-card-tag">
				<StatusBadge confirmed={trip.confirmed} stored={stored} />
			</span>
			<div className="vp-trips-card-head">
				<TripChips codes={tripCountries(trip.stops)} max={6} />
				{problems ? (
					<Badge tone="bad">{plural(problems, "issue")}</Badge>
				) : null}
			</div>
			<div className="vp-trips-card-main">
				<div className="vp-trips-card-text">
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
					</div>
				</div>
				<div className="vp-trips-card-days">
					<strong>{days}</strong>
					<span>{days === 1 ? "day" : "days"}</span>
				</div>
			</div>
			<DayStrip trip={trip} />
			<div className="vp-trips-card-foot">
				<span
					className="vp-trips-evidence"
					title="Stamps in this trip"
					data-none={trip.stampIds.length === 0 || undefined}
				>
					<StampIcon />{" "}
					{trip.stampIds.length === 0 ? "no stamps" : trip.stampIds.length}
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
