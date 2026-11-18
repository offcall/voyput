import { isIsoDate } from "@voyput/core";

/** Labelled native date input; the UI kit has no date field yet. */
export function DateField({
	label,
	value,
	onChange,
	onBlur,
	onEnter,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	onEnter?: () => void;
}) {
	return (
		<label className="vp-field">
			<span className="vp-field-label">{label}</span>
			<input
				className="vp-input"
				type="date"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onBlur={onBlur}
				onKeyDown={
					onEnter
						? (e) => {
								if (e.key === "Enter") onEnter();
							}
						: undefined
				}
			/>
		</label>
	);
}

/** The earliest year a typed date may have. */
const FIRST_YEAR = 1900;

/**
 * True for a whole date a person could have travelled on: a real day from
 * 1900 to the end of next year. A native date input reports years like 0002
 * while a year is typed digit by digit, and "" while a part is cleared.
 */
export function isPlausibleDay(value: string, today: string): boolean {
	if (!isIsoDate(value)) return false;
	const year = Number(value.slice(0, 4));
	return year >= FIRST_YEAR && year <= Number(today.slice(0, 4)) + 1;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a start/end pair cannot be saved, or null when it can. */
export function periodError(start: string, end: string): string | null {
	if (!DAY_RE.test(start) || !DAY_RE.test(end)) return "Set both dates.";
	if (start > end) return "The end is before the start.";
	return null;
}
