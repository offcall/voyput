import { type DayRun, dayIso, dayNumber, runsBetween } from "@voyput/core";
import type { CSSProperties } from "react";
import { useColourOf } from "./CountryTag";
import { flagOf } from "./format";

const pct = (days: number, total: number) => `${(days / total) * 100}%`;

/**
 * Countries by photo day around one date, as in an earlier prototype's per-stamp
 * timeline: a block per stay, hatched days without photos, a line on the date.
 * `shift` slides the days under the line while the strip is dragged: the line
 * then marks the date the stamp would get.
 */
export function DayStrip({
	dayRuns,
	date,
	stampCode,
	radius = 10,
	shift = 0,
}: {
	dayRuns: readonly DayRun[];
	date: string;
	/** The stamp's country; its blocks are drawn stronger. */
	stampCode: string | null;
	radius?: number;
	/** Days, a fraction while dragging, that the window is moved from `date`. */
	shift?: number;
}) {
	const colourOf = useColourOf();
	const target = dayNumber(date);
	if (target === null) return null;
	const from = target + shift - radius;
	const total = radius * 2 + 1;
	const runs = runsBetween(
		dayRuns,
		dayIso(Math.floor(from)),
		dayIso(Math.ceil(from) + total - 1),
	);
	const centre = dayIso(target + Math.round(shift));
	const label =
		runs.length === 0
			? `No photo locations within ${radius} days of ${centre}`
			: `Photos around ${centre}: ${runs
					.map((r) => `${r.countryCode} ${r.start} – ${r.end}`)
					.join(", ")}`;
	return (
		<span className="review-strip" role="img" aria-label={label}>
			{runs.map((run) => {
				const start = (dayNumber(run.start) ?? from) - from;
				const days = (dayNumber(run.end) ?? from) - from - start + 1;
				return (
					<span
						key={`${run.start}-${run.countryCode}`}
						className="review-strip-run"
						data-match={run.countryCode === stampCode || undefined}
						title={`${run.countryCode}: ${run.start} – ${run.end}`}
						style={
							{
								left: pct(start, total),
								width: pct(days, total),
								"--review-country": colourOf(run.countryCode),
							} as CSSProperties
						}
					>
						{days >= 3 ? (
							<span className="review-strip-label">
								<span aria-hidden="true">{flagOf(run.countryCode)}</span>{" "}
								{run.countryCode}
							</span>
						) : null}
					</span>
				);
			})}
			<span
				className="review-strip-marker"
				style={{ left: pct(radius + 0.5, total) }}
			/>
		</span>
	);
}
