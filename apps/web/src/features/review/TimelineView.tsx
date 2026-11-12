import {
	type DayRun,
	dayIso,
	dayNumber,
	runsBetween,
	type Stamp,
} from "@voyput/core";
import { Button } from "@voyput/ui";
import { useState } from "react";
import { directionIcon, flagOf } from "./format";
import { TIMELINE_WINDOWS } from "./reviewStore";

/** Stable colour per country code. */
const hue = (code: string): number =>
	[...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Countries per day from the location history, with stamps on top, a window at a time. */
export function TimelineView({
	dayRuns,
	stamps,
	windowDays,
	onWindowDays,
}: {
	dayRuns: readonly DayRun[];
	stamps: readonly Stamp[];
	windowDays: number;
	onWindowDays: (days: number) => void;
}) {
	const dated = stamps
		.filter((s): s is Stamp & { date: string } => s.date !== null)
		.sort((a, b) => a.date.localeCompare(b.date));
	const first = dated[0]?.date ?? dayRuns[0]?.start ?? null;
	const [start, setStart] = useState<number | null>(null);
	const from = start ?? (first ? dayNumber(first) : null);
	if (from === null)
		return <p>No stamps and no location history to show yet.</p>;

	const fromIso = dayIso(from);
	const toIso = dayIso(from + windowDays - 1);
	const runs = runsBetween(dayRuns, fromIso, toIso);
	const inWindow = dated.filter((s) => s.date >= fromIso && s.date <= toIso);
	const pct = (iso: string) =>
		(((dayNumber(iso) ?? from) - from) / windowDays) * 100;

	return (
		<div className="review-timeline">
			<div className="review-toolbar">
				<Button onClick={() => setStart(from - windowDays)}>← Earlier</Button>
				<strong>
					{fromIso} – {toIso}
				</strong>
				<Button onClick={() => setStart(from + windowDays)}>Later →</Button>
				<label>
					Window{" "}
					<select
						className="vp-input"
						value={windowDays}
						onChange={(event) => onWindowDays(Number(event.target.value))}
					>
						{TIMELINE_WINDOWS.map((days) => (
							<option key={days} value={days}>
								{days} days
							</option>
						))}
					</select>
				</label>
			</div>
			<div className="review-track" aria-hidden="true">
				<div className="review-track-stamps">
					{inWindow.map((s) => (
						<span
							key={s.id}
							className="review-track-stamp"
							style={{ left: `${pct(s.date)}%` }}
							title={`${s.date} ${s.direction} ${s.countryCode ?? ""}`}
						>
							{flagOf(s.countryCode)}
						</span>
					))}
				</div>
				<div className="review-track-days">
					{runs.map((run) => (
						<span
							key={`${run.start}-${run.countryCode}`}
							className="review-track-run"
							title={`${run.countryCode}: ${run.start} – ${run.end}`}
							style={{
								left: `${pct(run.start)}%`,
								width: `${((dayNumber(run.end) ?? 0) - (dayNumber(run.start) ?? 0) + 1) * (100 / windowDays)}%`,
								background: `hsl(${hue(run.countryCode)} 55% 60%)`,
							}}
						>
							{run.countryCode}
						</span>
					))}
				</div>
			</div>
			<div className="review-timeline-lists">
				<section>
					<h3>Stamps</h3>
					<ul aria-label="Stamps in window">
						{inWindow.map((s) => (
							<li key={s.id}>
								{s.date} {flagOf(s.countryCode)} {directionIcon(s.direction)}{" "}
								{s.direction} {s.country ?? "?"}
								{s.reviewed ? " ✓" : ""}
							</li>
						))}
					</ul>
				</section>
				<section>
					<h3>Countries by photos</h3>
					<ul aria-label="Countries by day">
						{runs.map((run) => (
							<li key={`${run.start}-${run.countryCode}`}>
								{flagOf(run.countryCode)} {run.countryCode} {run.start}
								{run.end !== run.start ? ` – ${run.end}` : ""}
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}
