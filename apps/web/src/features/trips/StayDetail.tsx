import {
	COUNTRY_CODES,
	type DatedStamp,
	isIsoDate,
	type NewStay,
	type Stamp,
	type StayEdge,
	type StayHint,
	spanLength,
	staySpan,
	TRAVEL_METHODS,
	type TravelMethod,
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
	METHOD_ICONS,
	METHOD_NAMES,
	plural,
	SOURCE_NAMES,
	stayRange,
} from "./format";
import { HINT_ICONS, hintText } from "./hintText";
import type { PhotoDays } from "./photoDays";
import { AddStayForm, SplitForm } from "./StayForms";
import { useSheetSwipe } from "./sheetSwipe";

/** A date set by hand: it no longer comes from a stamp. */
export function manualEdge(edge: StayEdge, date: string | null): StayEdge {
	const { stampId: _, ...rest } = edge;
	return { ...rest, date, source: "manual" };
}

function HintLines({ hints }: { hints: readonly StayHint[] }) {
	if (hints.length === 0) return null;
	return (
		<ul className="vp-stay-hints">
			{hints.map((h) => (
				<li
					key={`${h.kind}-${hintText(h)}`}
					className="vp-stay-hint"
					data-severity={h.severity}
				>
					<span aria-hidden="true">{HINT_ICONS[h.kind]}</span> {hintText(h)}
				</li>
			))}
		</ul>
	);
}

function MethodPick({
	label,
	value,
	onChange,
}: {
	label: string;
	value: TravelMethod;
	onChange: (method: TravelMethod) => void;
}) {
	return (
		<label className="vp-field">
			<span className="vp-field-label">Method</span>
			<select
				className="vp-input"
				aria-label={label}
				value={value}
				onChange={(e) => {
					const next = TRAVEL_METHODS.find((m) => m === e.target.value);
					if (next) onChange(next);
				}}
			>
				{TRAVEL_METHODS.map((m) => (
					<option key={m} value={m}>
						{METHOD_ICONS[m]} {METHOD_NAMES[m]}
					</option>
				))}
			</select>
		</label>
	);
}

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
			<div className="vp-stay-edge-fields">
				<DateField
					label={`${label} date`}
					value={typed}
					onChange={(value) => {
						setTyped(value);
						if (value === "" || isIsoDate(value))
							onChange(manualEdge(edge, value === "" ? null : value));
					}}
				/>
				<MethodPick
					label={`${label} method`}
					value={edge.method}
					onChange={(method) => onChange({ ...edge, method })}
				/>
			</div>
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

/** A form open in the panel. */
type PanelForm = "split" | "add" | null;

/**
 * The selected stay, to the right of the list (a bottom sheet on narrow
 * screens, with arrows and swipes to the stays around it): country, place,
 * edges, days, evidence, hints, and every action.
 */
export function StayDetail({
	stay,
	number,
	previous,
	next,
	hints,
	birth,
	today,
	photoDays,
	usable,
	stamps,
	split,
	addAfter,
	onChange,
	onDelete,
	onClose,
	onPrevious,
	onNext,
}: {
	stay: TravelStay;
	/** Position in the history, from 1. */
	number: number;
	previous: TravelStay | undefined;
	next: TravelStay | undefined;
	hints: readonly StayHint[];
	birth: string | null;
	today: string;
	photoDays: PhotoDays;
	/** Stamps the history is built from. */
	usable: readonly DatedStamp[];
	/** All stamps, also unusable ones a stay still points to. */
	stamps: readonly Stamp[];
	/** The day the split form starts at, whether a day can be split at, and the split. */
	split: {
		initial: string;
		valid: (date: string) => boolean;
		onSplit: (date: string) => void;
	};
	/** Dates the "add after" form starts with, and the add. */
	addAfter: {
		initial: { countryCode: string; arrival: string; departure: string };
		onAdd: (stay: NewStay) => void;
	};
	onChange: (stay: TravelStay) => void;
	onDelete: () => void;
	onClose: () => void;
	/** Opens the stay before or after this one; unset at either end. */
	onPrevious?: (() => void) | undefined;
	onNext?: (() => void) | undefined;
}) {
	const colorOf = useCountryColour();
	const span = staySpan(stay, birth, today);
	const days = spanLength(span);
	const [place, setPlace] = useState(stay.place);
	const [form, setForm] = useState<PanelForm>(null);
	const swipe = useSheetSwipe({
		close: onClose,
		previous: onPrevious,
		next: onNext,
	});
	const error = hints.some((h) => h.severity === "error");
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
			<header className="vp-trips-detail-head" {...swipe}>
				<span className="vp-trips-grabber" aria-hidden="true" />
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
					<span className="vp-trips-sheet-nav">
						<Button
							size="sm"
							variant="ghost"
							square
							aria-label="Previous stay"
							title="Previous stay (earlier)"
							disabled={!onPrevious}
							onClick={onPrevious}
						>
							←
						</Button>
						<Button
							size="sm"
							variant="ghost"
							square
							aria-label="Next stay"
							title="Next stay (later)"
							disabled={!onNext}
							onClick={onNext}
						>
							→
						</Button>
					</span>
					<Button
						size="sm"
						variant="ghost"
						square
						aria-label="Close the stay"
						title="Close"
						onClick={onClose}
					>
						×
					</Button>
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

			<fieldset className="vp-stay-kind" aria-label="Stay or transit">
				<button
					type="button"
					aria-pressed={stay.kind === "stay"}
					onClick={() => onChange({ ...stay, kind: "stay" })}
				>
					<span aria-hidden="true">🛏️</span> Stay
				</button>
				<button
					type="button"
					aria-pressed={stay.kind === "transit"}
					title="Transit: passed through, not visited"
					onClick={() => onChange({ ...stay, kind: "transit" })}
				>
					<span aria-hidden="true">🚏</span> Transit
				</button>
			</fieldset>

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

			<p className="vp-trips-muted">
				Evidence: {plural(stay.stampIds.length, "stamp")} ·{" "}
				{plural(stay.photoIds.length, "photo")}
				{stay.place ? ` (${stay.place})` : ""}
				{stay.kind === "transit"
					? " · transit photos do not count as a visit"
					: ""}
			</p>

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

			<HintLines hints={hints} />

			<div className="vp-stay-panel-actions">
				<div className="vp-stay-approve">
					<Button
						variant={stay.approved ? "default" : "primary"}
						disabled={!stay.approved && error}
						title={
							stay.approved
								? "Review this stay again"
								: error
									? "Fix the errors first"
									: "Approve this stay"
						}
						onClick={() => onChange({ ...stay, approved: !stay.approved })}
					>
						{stay.approved ? "↩ Reopen" : "✓ Approve"}
					</Button>
				</div>
				<div className="vp-stay-panel-more">
					<Button
						size="sm"
						aria-label={`Split stay ${number}`}
						aria-expanded={form === "split"}
						title="Split this stay in two at a day you pick"
						onClick={() => setForm(form === "split" ? null : "split")}
					>
						✂ Split
					</Button>
					<Button
						size="sm"
						aria-label={`Add a stay after stay ${number}`}
						aria-expanded={form === "add"}
						title="Add a stay after this one"
						onClick={() => setForm(form === "add" ? null : "add")}
					>
						+ Add after
					</Button>
					<span className="vp-trips-spacer" />
					<Button
						size="sm"
						variant="danger"
						aria-label={`Delete stay ${number}`}
						title="Delete this stay; Undo brings it back"
						onClick={onDelete}
					>
						Delete
					</Button>
				</div>
			</div>
			{form === "split" ? (
				<SplitForm
					initial={split.initial}
					valid={split.valid}
					onSplit={(date) => {
						split.onSplit(date);
						setForm(null);
					}}
					onCancel={() => setForm(null)}
				/>
			) : form === "add" ? (
				<AddStayForm
					initial={addAfter.initial}
					onAdd={addAfter.onAdd}
					onCancel={() => setForm(null)}
				/>
			) : null}

			{linked.length > 0 ? (
				<>
					<h3 className="vp-trips-h3">Stamps</h3>
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
				</>
			) : null}
		</section>
	);
}
