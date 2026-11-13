import {
	type StayEdge,
	type StayHint,
	spanLength,
	staySpan,
	TRAVEL_METHODS,
	type TravelMethod,
	type TravelStay,
} from "@voyput/core";
import { Button } from "@voyput/ui";
import type { ReactNode } from "react";
import {
	countryName,
	flagOf,
	METHOD_ICONS,
	METHOD_NAMES,
	plural,
	stayRange,
} from "./format";
import { CROSSING_HINTS, HINT_ICONS, hintText } from "./hintText";

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
		<select
			className="vp-stay-method"
			aria-label={label}
			title={`${label}: ${METHOD_NAMES[value]}`}
			value={value}
			data-unknown={value === "unknown" || undefined}
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
	);
}

/** One stay in the list: what, when, how long, how it began and ended. */
export function StayRow({
	stay,
	number,
	hints,
	birth,
	today,
	selected,
	onSelect,
	onChange,
	onDelete,
	onSplit,
	onAddAfter,
	below,
}: {
	stay: TravelStay;
	/** Position in the history, from 1. */
	number: number;
	hints: readonly StayHint[];
	birth: string | null;
	today: string;
	selected: boolean;
	onSelect: () => void;
	onChange: (stay: TravelStay) => void;
	onDelete: () => void;
	/** Opens the form that asks for the day to split at. */
	onSplit: () => void;
	/** Opens the form for a new stay right after this one. */
	onAddAfter: () => void;
	/** A form opened from this row (split, add after). */
	below?: ReactNode;
}) {
	const span = staySpan(stay, birth, today);
	const days = spanLength(span);
	const ongoing = stay.departure.date === null;
	const name = countryName(stay.countryCode);
	const range = stayRange(stay.arrival.date ?? birth, stay.departure.date);
	const crossing = hints.filter((h) => CROSSING_HINTS.has(h.kind));
	const own = hints.filter((h) => !CROSSING_HINTS.has(h.kind));
	const error = hints.some((h) => h.severity === "error");
	const method = (side: "arrival" | "departure") => (m: TravelMethod) =>
		onChange({ ...stay, [side]: { ...stay[side], method: m } });
	return (
		<div className="vp-stay-block">
			<HintLines hints={crossing} />
			<div
				className="vp-stay"
				data-selected={selected || undefined}
				data-approved={stay.approved || undefined}
				data-error={error || undefined}
				data-kind={stay.kind}
			>
				<span className="vp-stay-num">{number}</span>
				<button
					type="button"
					className="vp-stay-main"
					aria-pressed={selected}
					aria-label={`${number}. ${name}, ${range}`}
					onClick={onSelect}
				>
					<span className="vp-stay-flag" aria-hidden="true">
						{flagOf(stay.countryCode)}
					</span>
					<span className="vp-stay-text">
						<strong className="vp-stay-country">
							{name}
							{stay.place ? (
								<span className="vp-stay-place"> · {stay.place}</span>
							) : null}
						</strong>
						<span className="vp-stay-dates">{range}</span>
					</span>
					<span
						className="vp-stay-days"
						title="Calendar days, arrival and departure included"
					>
						{days === null ? "— days" : plural(days, "day")}
						{ongoing ? " · now" : ""}
					</span>
				</button>
				<div className="vp-stay-tools">
					<fieldset className="vp-stay-kind" aria-label="Stay or transit">
						<button
							type="button"
							aria-pressed={stay.kind === "stay"}
							aria-label="Stay"
							title="Stay"
							onClick={() => onChange({ ...stay, kind: "stay" })}
						>
							🛏️
						</button>
						<button
							type="button"
							aria-pressed={stay.kind === "transit"}
							aria-label="Transit"
							title="Transit: passed through, not visited"
							onClick={() => onChange({ ...stay, kind: "transit" })}
						>
							🚏
						</button>
					</fieldset>
					<span className="vp-stay-methods">
						<MethodPick
							label="Arrival method"
							value={stay.arrival.method}
							onChange={method("arrival")}
						/>
						<span aria-hidden="true">→</span>
						<MethodPick
							label="Departure method"
							value={stay.departure.method}
							onChange={method("departure")}
						/>
					</span>
					<Button
						size="sm"
						variant={stay.approved ? "ghost" : "secondary"}
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
					<Button
						size="sm"
						variant="ghost"
						aria-label={`Split stay ${number}`}
						title="Split this stay in two at a day you pick"
						onClick={onSplit}
					>
						✂ Split
					</Button>
					<Button
						size="sm"
						variant="ghost"
						square
						aria-label={`Add a stay after stay ${number}`}
						title="Add a stay after this one"
						onClick={onAddAfter}
					>
						+
					</Button>
					<Button
						size="sm"
						variant="ghost"
						square
						aria-label={`Delete stay ${number}`}
						title="Delete this stay; Undo brings it back"
						onClick={onDelete}
					>
						🗑
					</Button>
				</div>
			</div>
			<HintLines hints={own} />
			{below}
		</div>
	);
}
