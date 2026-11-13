import {
	type Boundary,
	changePeriod,
	type DatedStamp,
	type Stamp,
	type Trip,
	type TripEvidence,
	type TripStop,
} from "@voyput/core";
import { Button, TextField } from "@voyput/ui";
import { useMemo, useState } from "react";
import { CONFLICT_WINDOW_DAYS, tripProblems } from "./conflicts";
import { DateField, periodError } from "./DateField";
import { DaysTimeline } from "./DaysTimeline";
import {
	addDays,
	colorOf,
	countryName,
	dayCount,
	flagOf,
	longDay,
	plural,
	rangeText,
	tripCountries,
} from "./format";
import type { PhotoDays } from "./photoDays";
import { StatusBadge } from "./StatusBadge";
import { TripChip, TripChips } from "./TripChip";

/** Days of context shown before and after the trip on the timeline. */
const CONTEXT_DAYS = 5;
/** Longer windows would make day columns too thin to read or drag. */
const MAX_TIMELINE_DAYS = 400;

const sourceText = (b: Boundary) =>
	b.source === "stamp"
		? `From a stamp · ${b.method}`
		: b.source === "manual"
			? "Set by hand"
			: "Estimated from photos";

function BoundaryBox({
	label,
	boundary,
}: {
	label: string;
	boundary: Boundary;
}) {
	return (
		<div className="vp-trips-bound" data-source={boundary.source}>
			<span className="vp-trips-bound-label">{label}</span>
			<strong className="vp-trips-bound-date">{longDay(boundary.date)}</strong>
			<span className="vp-trips-bound-source">{sourceText(boundary)}</span>
		</div>
	);
}

interface StopRun {
	start: string;
	end: string;
	countryCode: string;
	country: string;
	cities: string[];
}

/** Consecutive days in the same country and cities, as one row. */
function stopRuns(stops: readonly TripStop[]): StopRun[] {
	const runs: StopRun[] = [];
	for (const s of stops) {
		const last = runs.at(-1);
		if (
			last &&
			last.countryCode === s.countryCode &&
			last.cities.join("|") === s.cities.join("|") &&
			addDays(last.end, 1) === s.day
		)
			last.end = s.day;
		else
			runs.push({
				start: s.day,
				end: s.day,
				countryCode: s.countryCode,
				country: s.country,
				cities: s.cities,
			});
	}
	return runs;
}

/** Edit one trip and see what it is made of. */
export function TripDetail({
	trip,
	stored,
	evidence,
	stamps,
	photoDays,
	onSave,
	onDelete,
}: {
	trip: Trip;
	stored: boolean;
	evidence: TripEvidence;
	/** All stamps, also the ones not usable for trips. */
	stamps: readonly Stamp[];
	photoDays: PhotoDays;
	onSave: (trip: Trip) => void;
	onDelete: (trip: Trip) => void;
}) {
	const [title, setTitle] = useState(trip.title);
	const [start, setStart] = useState(trip.start);
	const [end, setEnd] = useState(trip.end);
	const error =
		periodError(start, end) ?? (title.trim() ? null : "Set a title.");
	const draft =
		error || (start === trip.start && end === trip.end)
			? trip
			: changePeriod(trip, evidence, start, end);
	const save = (confirmed: boolean) =>
		onSave({ ...draft, title: title.trim(), confirmed });

	const usable = useMemo(
		() => new Map(evidence.stamps.map((s) => [s.id, s])),
		[evidence.stamps],
	);
	const linked = stamps
		.filter((s) => draft.stampIds.includes(s.id))
		.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
	const problems = tripProblems(draft.stampIds, usable, photoDays);
	const conflicted = new Set(problems.conflicts.map((c) => c.stamp.id));

	/** Days shown; fixed while dragging, widened when a typed date falls outside. */
	const [view, setView] = useState(() => ({
		from: addDays(trip.start, -CONTEXT_DAYS),
		to: addDays(trip.end, CONTEXT_DAYS),
	}));
	const typed = (set: (day: string) => void) => (day: string) => {
		set(day);
		if (periodError(day, day)) return;
		setView((v) => ({
			from: day < v.from ? addDays(day, -CONTEXT_DAYS) : v.from,
			to: day > v.to ? addDays(day, CONTEXT_DAYS) : v.to,
		}));
	};
	const { from, to } = view;
	const nearby: DatedStamp[] = evidence.stamps.filter(
		(s) => s.date >= from && s.date <= to,
	);

	return (
		<section className="vp-card vp-trips-detail">
			<header className="vp-trips-detail-head">
				<div>
					<TripChips codes={tripCountries(draft.stops)} max={12} />
					<h2
						className="vp-trips-detail-title"
						aria-label={`Trip: ${trip.title}`}
					>
						{trip.title}
					</h2>
					<div className="vp-trips-card-dates">
						{error ? (
							<span role="alert" className="vp-trips-error">
								{error}
							</span>
						) : (
							<>
								{rangeText(draft.start, draft.end)}
								<span className="vp-trips-dot">·</span>
								{plural(dayCount(draft.start, draft.end), "day")}
							</>
						)}
					</div>
				</div>
				<StatusBadge confirmed={trip.confirmed} stored={stored} />
			</header>

			<div className="vp-trips-form">
				<TextField label="Title" value={title} onChange={setTitle} />
				<DateField label="Start" value={start} onChange={typed(setStart)} />
				<DateField label="End" value={end} onChange={typed(setEnd)} />
			</div>

			<div className="vp-trips-bounds">
				<BoundaryBox label="Arrival" boundary={draft.arrival} />
				<BoundaryBox label="Departure" boundary={draft.departure} />
			</div>

			<h3 className="vp-trips-h3">Days</h3>
			{dayCount(from, to) > MAX_TIMELINE_DAYS ? (
				<p className="vp-trips-muted">
					This period is too long to show day by day.
				</p>
			) : (
				<DaysTimeline
					from={from}
					to={to}
					start={error ? trip.start : start}
					end={error ? trip.end : end}
					home={evidence.home}
					photoDays={photoDays}
					stamps={nearby}
					linked={new Set(draft.stampIds)}
					conflicted={conflicted}
					onChange={(edge, day) =>
						edge === "start" ? setStart(day) : setEnd(day)
					}
				/>
			)}

			{problems.conflicts.length > 0 ? (
				<div className="vp-trips-conflict" data-kind="photos">
					<div className="vp-trips-conflict-head">
						<code>stamp-without-photos</code>
						<span>
							No photo within {CONFLICT_WINDOW_DAYS} days shows the stamp's
							country
						</span>
						<strong className="vp-trips-conflict-count">
							{problems.conflicts.length}
						</strong>
					</div>
					{problems.conflicts.map(({ stamp, seen }) => (
						<div key={stamp.id} className="vp-trips-conflict-row">
							<TripChip code={stamp.countryCode} />
							<span className="vp-trips-mono">{stamp.date}</span>
							<span>{stamp.direction}</span>
							<span className="vp-trips-muted">photos show</span>
							{seen.map((cc) => (
								<TripChip key={cc} code={cc} />
							))}
						</div>
					))}
				</div>
			) : null}
			{problems.missing.length > 0 ? (
				<div className="vp-trips-conflict" data-kind="missing">
					<div className="vp-trips-conflict-head">
						<code>stamp-changed</code>
						<span>
							Deleted or changed on Review since this trip was saved; the trip
							still counts them
						</span>
						<strong className="vp-trips-conflict-count">
							{problems.missing.length}
						</strong>
					</div>
				</div>
			) : null}

			<h3 className="vp-trips-h3">Stops</h3>
			{draft.stops.length === 0 ? (
				<p className="vp-trips-muted">No stops in this period.</p>
			) : (
				<div className="vp-trips-stops">
					{stopRuns(draft.stops).map((run) => (
						<div
							key={`${run.start}|${run.countryCode}`}
							className="vp-trips-stop"
						>
							<span
								className="vp-trips-stop-bar"
								style={{ background: colorOf(run.countryCode) }}
							/>
							<span className="vp-trips-mono">
								<time>{run.start}</time>
								{run.end !== run.start ? (
									<>
										{" – "}
										<time>{run.end}</time>
									</>
								) : null}
							</span>
							<span className="vp-trips-stop-country">
								<span aria-hidden="true">{flagOf(run.countryCode)}</span>{" "}
								{run.country}
							</span>
							<span className="vp-trips-stop-cities">
								{run.cities.length ? (
									run.cities.map((c, i) => (
										<span key={c}>
											{i > 0 ? ", " : null}
											<span>{c}</span>
										</span>
									))
								) : (
									<span className="vp-trips-muted">—</span>
								)}
							</span>
							<span className="vp-trips-muted">
								{plural(dayCount(run.start, run.end), "day")}
							</span>
						</div>
					))}
				</div>
			)}

			<h3 className="vp-trips-h3">Stamps</h3>
			{linked.length === 0 ? (
				<p className="vp-trips-muted">No stamps in this period.</p>
			) : (
				<ul className="vp-trips-stamps">
					{linked.map((s) => (
						<li
							key={s.id}
							data-conflict={
								conflicted.has(s.id) || !usable.has(s.id) || undefined
							}
						>
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
			)}

			<footer className="vp-trips-actions">
				<Button variant="danger" onClick={() => onDelete(trip)}>
					Delete
				</Button>
				<span className="vp-trips-spacer" />
				<Button disabled={!!error} onClick={() => save(trip.confirmed)}>
					Save
				</Button>
				<Button variant="primary" disabled={!!error} onClick={() => save(true)}>
					Confirm
				</Button>
			</footer>
		</section>
	);
}
