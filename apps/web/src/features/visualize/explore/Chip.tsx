import type { ReactNode } from "react";

/** A pill toggle; `aria-pressed` marks the selected one. */
export function Chip({
	selected,
	onClick,
	colour,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	/** A dot in this colour before the label, e.g. a country's palette colour. */
	colour?: string;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className="vp-explore-chip"
			aria-pressed={selected}
			onClick={onClick}
		>
			{colour ? (
				<i className="vp-explore-dot" style={{ background: colour }} />
			) : null}
			{children}
		</button>
	);
}

/** A labelled row of chips. */
export function ChipGroup({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset would add a legend box around a row of buttons.
		<div className="vp-explore-chips" role="group" aria-label={label}>
			<span className="vp-explore-chips-label">{label}</span>
			{children}
		</div>
	);
}
