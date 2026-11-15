import { type Bar, topBars } from "@voyput/core";
import { flagEmoji } from "@voyput/ui";
import { useCountryColour } from "../../../app/countryColours";
import { formatInt } from "../charts/format";
import { SHOWN_AT_FIRST, useShowAll } from "../ShowAll";

/**
 * Ranked bars, largest first (or in the given order with `keepOrder`).
 * Bars with a country take its colour; clickable when `onPick` is set.
 * Ranked lists show the top `limit` and a "Show all N" toggle.
 */
export function BarList({
	bars,
	unit,
	limit = SHOWN_AT_FIRST,
	keepOrder = false,
	onPick,
	label,
}: {
	bars: readonly Bar[];
	unit: string;
	limit?: number;
	keepOrder?: boolean;
	onPick?: (bar: Bar) => void;
	/** Accessible name of the list. */
	label: string;
}) {
	const colourOf = useCountryColour();
	const ranked = keepOrder
		? topBars(bars, bars.length)
		: topBars(
				bars.filter((b) => b.value > 0),
				bars.length,
			);
	const { shown, toggle } = useShowAll(
		keepOrder ? bars : ranked.bars,
		keepOrder ? bars.length : limit,
	);
	if (shown.length === 0) return <p className="vp-viz-muted">No data.</p>;
	return (
		<>
			<ol className="vp-explore-bars" aria-label={label}>
				{shown.map((bar, i) => {
					const content = (
						<>
							{keepOrder ? null : (
								<span className="vp-explore-rank">{i + 1}</span>
							)}
							<span className="vp-explore-bar-label">
								{bar.countryCode ? `${flagEmoji(bar.countryCode)} ` : ""}
								{bar.label}
							</span>
							<span className="vp-explore-bar-track">
								<i
									style={{
										width: `${(bar.value / ranked.max) * 100}%`,
										background: bar.countryCode
											? colourOf(bar.countryCode)
											: "var(--vp-accent)",
									}}
								/>
							</span>
							<strong>
								{formatInt(bar.value)} <small>{unit}</small>
							</strong>
						</>
					);
					return (
						<li key={bar.id} data-keep-order={keepOrder || undefined}>
							{onPick ? (
								<button
									type="button"
									className="vp-explore-bar"
									onClick={() => onPick(bar)}
								>
									{content}
								</button>
							) : (
								<div className="vp-explore-bar">{content}</div>
							)}
						</li>
					);
				})}
			</ol>
			{toggle}
		</>
	);
}
