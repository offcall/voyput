import {
	COUNTRY_CODES,
	type DatedStamp,
	isIsoDate,
	type Stamp,
	type StayEdge,
	spanLength,
	staySpan,
	type TravelStay,
} from "@voyput/core";
import { Badge, Button } from "@voyput/ui";
import { useState } from "react";
import { useCountryColour } from "../../app/countryColours";
import { DateField } from "./DateField";
import { DaysTimeline } from "./DaysTimeline";
import {
	addDays,
	countryName,
	dayCount,
	flagOf,
	longDay,
	plural,
	SOURCE_NAMES,
	stayRange,
} from "./format";
import type { PhotoDays } from "./photoDays";
import { manualEdge } from "./StayRow";

/** Days of context shown before and after the stay on the timeline. */
const CONTEXT_DAYS = 5;
/** Longer windows would make day columns too thin to read or drag. */
const MAX_TIMELINE_DAYS = 400;

function EdgeEditor({
	label,
	edge,
	neighbour,
	neighbourLabel,
	onChange,
}: {
	label: "Arrival" | "Departure";
	edge: StayEdge;
	/** The other side of this crossing: the previous departure or the next arrival. */
	neighbour: string | null;
	neighbourLabel: string;
	onChange: (edge: StayEdge) => void;
}) {
	const [typed, setTyped] = useState(edge.date ?? "");
	const [shown, setShown] = useState(edge.date);
	// A drag, undo or match moved the date: show it.
	if (edge.date !== shown) {
		setShown(edge.date);
		setTyped(edge.date ?? "");
	}
	return (
		<div className="vp-stay-edge" data-source={edge.source}>
			<DateField
				label={`${label} date`}
				value={typed}
				onChange={(value) => {
					setTyped(value);
					if (value === "" || isIsoDate(value))
						onChange(manualEdge(edge, value === "" ? null : value));
				}}
			/>
			<span className="vp-stay-edge-source">
				{edge.date === null
					? label === "Arrival"
						? "Since birth"
						: "Still there"
					: SOURCE_NAMES[edge.source]}
			</span>
			{neighbour && neighbour !== edge.date ? (
				<Button
					size="sm"
					variant="ghost"
					onClick={() =>
						onChange({ ...edge, date: neighbour, source: "manual" })
					}
				>
					{neighbourLabel} · {longDay(neighbour)}
				</Button>
			) : null}
		</div>
	);
}

/** The selected stay: its edges, country and place, days and stamps. */
export function StayDetail({
	stay,
	previous,
	next,
	birth,
	today,
	photoDays,
	usable,
	stamps,
	onChange,
}: {
	stay: TravelStay;
	previous: TravelStay | undefined;
	next: TravelStay | undefined;
	birth: string | null;
	today: string;
	photoDays: PhotoDays;
	/** Stamps the history is built from. */
	usable: readonly DatedStamp[];
	/** All stamps, also unusable ones a stay still points to. */
	stamps: readonly Stamp[];
	onChange: (stay: TravelStay) => void;
}) {
	const colorOf = useCountryColour();
	const span = staySpan(stay, birth, today);
	const days = spanLength(span);
	const [place, setPlace] = useState(stay.place);
	const linked = stamps
		.filter((s) => stay.stampIds.includes(s.id))
		.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
	const { start, end } = span;
	const timeline =
		start !== null && end !== null && start <= end
			? {
					from: addDays(start, -CONTEXT_DAYS),
					to: addDays(end, CONTEXT_DAYS),
				}
			: null;

	return (
		<section
			className="vp-card vp-trips-detail"
			aria-label={`Stay: ${countryName(stay.countryCode)}`}
		>
			<header className="vp-trips-detail-head">
				<div>
					<h2 className="vp-trips-detail-title">
						<span aria-hidden="true">{flagOf(stay.countryCode)}</span>{" "}
						{countryName(stay.countryCode)}
					</h2>
					<div className="vp-trips-muted">
						{stayRange(stay.arrival.date ?? birth, stay.departure.date)}
						<span className="vp-trips-dot">·</span>
						{days === null ? "— days" : plural(days, "day")}
					</div>
				</div>
				<span className="vp-stay-badges">
					{stay.kind === "transit" ? <Badge tone="info">Transit</Badge> : null}
					<Badge tone={stay.approved ? "good" : "warn"} dot>
						{stay.approved ? "Approved" : "To approve"}
					</Badge>
				</span>
			</header>

			<div className="vp-stay-form">
				<label className="vp-field">
					<span className="vp-field-label">Country</span>
					<select
						className="vp-input"
						value={stay.countryCode}
						onChange={(e) => onChange({ ...stay, countryCode: e.target.value })}
					>
						{COUNTRY_CODES.map((cc) => (
							<option key={cc} value={cc}>
								{countryName(cc)}
							</option>
						))}
						{COUNTRY_CODES.includes(stay.countryCode) ? null : (
							<option value={stay.countryCode}>
								{countryName(stay.countryCode)}
							</option>
						)}
					</select>
				</label>
				<label className="vp-field">
					<span className="vp-field-label">Place</span>
					<input
						className="vp-input"
						value={place}
						placeholder="City or border post"
						onChange={(e) => setPlace(e.target.value)}
						onBlur={() => {
							if (place.trim() !== stay.place)
								onChange({ ...stay, place: place.trim() });
						}}
					/>
				</label>
			</div>

			<div className="vp-stay-edges">
				<EdgeEditor
					label="Arrival"
					edge={stay.arrival}
					neighbour={previous?.departure.date ?? null}
					neighbourLabel="Use previous departure"
					onChange={(arrival) => onChange({ ...stay, arrival })}
				/>
				<EdgeEditor
					label="Departure"
					edge={stay.departure}
					neighbour={next?.arrival.date ?? null}
					neighbourLabel="Use next arrival"
					onChange={(departure) => onChange({ ...stay, departure })}
				/>
			</div>

			<h3 className="vp-trips-h3">Days</h3>
			{!timeline ? (
				<p className="vp-trips-muted">
					Set both dates (or the birth date) to see the days.
				</p>
			) : dayCount(timeline.from, timeline.to) > MAX_TIMELINE_DAYS ? (
				<p className="vp-trips-muted">
					This stay is too long to show day by day.
				</p>
			) : (
				<DaysTimeline
					from={timeline.from}
					to={timeline.to}
					start={start ?? timeline.from}
					end={end ?? timeline.to}
					photoDays={photoDays}
					stamps={usable.filter(
						(s) => s.date >= timeline.from && s.date <= timeline.to,
					)}
					linked={new Set(stay.stampIds)}
					conflicted={new Set()}
					onChange={(side, day) =>
						onChange(
							side === "start"
								? { ...stay, arrival: manualEdge(stay.arrival, day) }
								: { ...stay, departure: manualEdge(stay.departure, day) },
						)
					}
				/>
			)}

			<h3 className="vp-trips-h3">Evidence</h3>
			<p className="vp-trips-muted">
				{plural(stay.stampIds.length, "stamp")} ·{" "}
				{plural(stay.photoIds.length, "photo")}
				{stay.kind === "transit"
					? " · transit photos do not count as a visit"
					: ""}
			</p>
			{linked.length > 0 ? (
				<ul className="vp-trips-stamps">
					{linked.map((s) => (
						<li key={s.id}>
							<span
								className="vp-trips-stamp-mark"
								style={{ color: colorOf(s.countryCode ?? "") }}
								aria-hidden="true"
							>
								{s.direction === "entry"
									? "▲"
									: s.direction === "exit"
										? "▼"
										: "◆"}
							</span>
							<span className="vp-trips-mono">{s.date ?? "no date"}</span>
							<span className="vp-trips-stamp-dir">{s.direction}</span>
							<span>
								<span aria-hidden="true">{flagOf(s.countryCode ?? "")}</span>{" "}
								{s.country ?? countryName(s.countryCode ?? "")}
							</span>
							<span className="vp-trips-muted">
								{s.location ?? "unknown place"} · {s.borderCrossing}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
