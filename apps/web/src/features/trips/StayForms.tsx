import { COUNTRY_CODES, isIsoDate, type NewStay } from "@voyput/core";
import { Button } from "@voyput/ui";
import { useEffect, useRef, useState } from "react";
import { DateField } from "./DateField";
import { countryName, flagOf } from "./format";

/** A select of every country, by English name. */
export function CountrySelect({
	label,
	value,
	placeholder,
	onChange,
}: {
	label: string;
	value: string;
	placeholder: string;
	onChange: (code: string) => void;
}) {
	return (
		<label className="vp-field">
			<span className="vp-field-label">{label}</span>
			<select
				className="vp-input"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value="">{placeholder}</option>
				{COUNTRY_CODES.map((cc) => (
					<option key={cc} value={cc}>
						{flagOf(cc)} {countryName(cc)}
					</option>
				))}
			</select>
		</label>
	);
}

/**
 * Brings a form that just opened into view: the "+ Add stay" button stays
 * at the top of the screen while the form opens at the top of the list, and
 * the split and add forms open low in the phone sheet.
 */
function useShownOnOpen() {
	const ref = useRef<HTMLFormElement>(null);
	useEffect(() => {
		ref.current?.scrollIntoView?.({ block: "nearest" });
	}, []);
	return ref;
}

/** Why a new stay cannot be added yet, or null. */
function addError(add: {
	countryCode: string;
	arrival: string;
	departure: string;
}): string | null {
	if (!add.countryCode) return "Choose a country.";
	if (!isIsoDate(add.arrival)) return "Set the arrival date.";
	if (add.departure !== "" && !isIsoDate(add.departure))
		return "Set the departure date or leave it empty (still there).";
	if (add.departure !== "" && add.departure < add.arrival)
		return "The departure is before the arrival.";
	return null;
}

/** Country and dates of a stay to add, prefilled from where the user asked for it. */
export function AddStayForm({
	initial,
	onAdd,
	onCancel,
}: {
	initial: { countryCode: string; arrival: string; departure: string };
	onAdd: (stay: NewStay) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState(initial);
	const error = addError(draft);
	const ref = useShownOnOpen();
	return (
		<form
			ref={ref}
			className="vp-stay-add"
			aria-label="Add stay"
			onSubmit={(e) => {
				e.preventDefault();
				if (error) return;
				onAdd({
					countryCode: draft.countryCode,
					arrival: draft.arrival,
					departure: draft.departure || null,
				});
			}}
		>
			<CountrySelect
				label="Country"
				value={draft.countryCode}
				placeholder="Choose a country"
				onChange={(countryCode) => setDraft({ ...draft, countryCode })}
			/>
			<DateField
				label="Arrival date"
				value={draft.arrival}
				onChange={(arrival) => setDraft({ ...draft, arrival })}
			/>
			<DateField
				label="Departure date"
				value={draft.departure}
				onChange={(departure) => setDraft({ ...draft, departure })}
			/>
			<div className="vp-stay-form-actions">
				<Button size="sm" variant="primary" type="submit" disabled={!!error}>
					Add stay
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				{error ? <span className="vp-trips-muted">{error}</span> : null}
			</div>
		</form>
	);
}

/** The day to split a stay at: it ends the first part and begins the second. */
export function SplitForm({
	initial,
	valid,
	onSplit,
	onCancel,
}: {
	initial: string;
	/** Whether the day lies inside the stay. */
	valid: (date: string) => boolean;
	onSplit: (date: string) => void;
	onCancel: () => void;
}) {
	const [date, setDate] = useState(initial);
	const ok = isIsoDate(date) && valid(date);
	const ref = useShownOnOpen();
	return (
		<form
			ref={ref}
			className="vp-stay-add"
			aria-label="Split stay"
			onSubmit={(e) => {
				e.preventDefault();
				if (ok) onSplit(date);
			}}
		>
			<DateField label="Split on" value={date} onChange={setDate} />
			<div className="vp-stay-form-actions">
				<Button size="sm" variant="primary" type="submit" disabled={!ok}>
					✂ Split
				</Button>
				<Button size="sm" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<span className="vp-trips-muted">
					{ok
						? "The first part ends on this day, the second begins on it; change the second one's country or dates after."
						: "Pick a day after the arrival and before the departure."}
				</span>
			</div>
		</form>
	);
}
