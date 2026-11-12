/** Labelled native date input; the UI kit has no date field yet. */
export function DateField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<label className="vp-field">
			<span className="vp-field-label">{label}</span>
			<input
				className="vp-input"
				type="date"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		</label>
	);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a start/end pair cannot be saved, or null when it can. */
export function periodError(start: string, end: string): string | null {
	if (!DAY_RE.test(start) || !DAY_RE.test(end)) return "Set both dates.";
	if (start > end) return "The end is before the start.";
	return null;
}
