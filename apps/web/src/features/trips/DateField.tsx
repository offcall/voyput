/** Labelled native date input; the UI kit has no date field yet. */
export function DateField({
	label,
	value,
	onChange,
	onBlur,
	onEnter,
	onType,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	onEnter?: () => void;
	/** Any other key: the value is being typed, not picked. */
	onType?: () => void;
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
					onEnter || onType
						? (e) => {
								if (e.key === "Enter") onEnter?.();
								else onType?.();
							}
						: undefined
				}
			/>
		</label>
	);
}
