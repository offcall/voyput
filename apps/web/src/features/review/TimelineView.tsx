import {
	checkStamp,
	type DayRun,
	dayIso,
	dayNumber,
	nearbyPhotos,
	type PhotoIndex,
	runsBetween,
	type Severity,
	type Stamp,
	severity,
} from "@voyput/core";
import { Button, EmptyState, PixelArt } from "@voyput/ui";
import {
	type CSSProperties,
	Fragment,
	type ReactNode,
	useMemo,
	useState,
} from "react";
import { CountryTag, useColourOf } from "./CountryTag";
import { DayStrip } from "./DayStrip";
import {
	crossingIcon,
	directionIcon,
	flagOf,
	formatDay,
	formatDayRange,
	plural,
} from "./format";
import { TIMELINE_WINDOWS } from "./reviewStore";
import {
	buildTimeline,
	chronological,
	type DatedStamp,
	daysBetween,
	endOf,
	startOf,
	type TimelineItem,
} from "./stays";
import type { TravelDays } from "./strip";

/** Inline style that sets `--review-country` to a country's colour. */
function useHueStyle() {
	const colourOf = useColourOf();
	return (code: string | null) =>
		({ "--review-country": colourOf(code) }) as CSSProperties;
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

const stampLabel = (s: Stamp) =>
	`${s.date ?? "no date"} ${s.direction} ${s.country ?? s.countryCode ?? "unknown country"}`;

/**
 * The stamps in date order, entries paired with their exits, next to what the
 * photo location history says; a band above shows countries per day, a window at a time.
 */
export function TimelineView({
	dayRuns,
	travelDays,
	index,
	stamps,
	photoNames,
	windowDays,
	onWindowDays,
	stripDays = 10,
	onOpen,
}: {
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
	index: PhotoIndex;
	stamps: readonly Stamp[];
	/** Photo id → file name. */
	photoNames: ReadonlyMap<string, string>;
	windowDays: number;
	onWindowDays: (days: number) => void;
	/** Days before and after each stamp in its row's strip and location check. */
	stripDays?: number;
	/** Opens the stamp's photo and card on the Photos tab. */
	onOpen: (stamp: Stamp) => void;
}) {
	const levels = useMemo(
		() =>
			new Map(
				stamps.map((stamp) => [
					stamp.id,
					severity({ stamp, check: checkStamp(index, stamp, stripDays) }),
				]),
			),
		[stamps, index, stripDays],
	);
	const items = useMemo(() => buildTimeline(stamps), [stamps]);
	const dated = useMemo(() => chronological(stamps), [stamps]);
	const undated = stamps.filter((s) => s.date === null);
	const first = dated[0]?.date ?? dayRuns[0]?.start ?? null;
	const [start, setStart] = useState<number | null>(null);
	const from = start ?? (first ? dayNumber(first) : null);
	if (from === null && undated.length === 0)
		return (
			<EmptyState
				art={<PixelArt name="stamp" scale={5} />}
				title="Nothing to show yet"
			>
				Stamps with a date and the photo location history appear here once they
				are imported.
			</EmptyState>
		);

	const countries = new Set(dated.map((s) => s.countryCode).filter(Boolean));
	const problems = [...levels.values()].filter((l) => l !== "ok").length;
	const stays = items.filter((item) => item.kind === "stay").length;

	// Headings and gaps follow start order; the latest end seen so far bounds a gap,
	// so stays over New Year or overlapping stays neither repeat years nor go negative.
	let lastYear = "";
	let maxEnd = "";
	const marks = items.map((item) => {
		const start = startOf(item);
		const year = start.slice(0, 4);
		const heading = year !== lastYear ? year : null;
		const gap = maxEnd ? daysBetween(maxEnd, start) : 0;
		lastYear = year;
		if (endOf(item) > maxEnd) maxEnd = endOf(item);
		return { heading, gap };
	});

	const row = (stamp: DatedStamp) => (
		<StampRow
			key={stamp.id}
			stamp={stamp}
			level={levels.get(stamp.id) ?? "ok"}
			photoName={photoNames.get(stamp.photoId) ?? ""}
			dayRuns={dayRuns}
			travelDays={travelDays}
			stripDays={stripDays}
			index={index}
			onOpen={onOpen}
		/>
	);

	return (
		<div className="review-timeline">
			{from === null ? null : (
				<>
					<dl className="review-stats">
						<div>
							<dt>Stamps</dt>
							<dd>{stamps.length}</dd>
						</div>
						<div>
							<dt>Countries</dt>
							<dd>{countries.size}</dd>
						</div>
						<div>
							<dt>Stays</dt>
							<dd>{stays}</dd>
						</div>
						<div data-tone={problems ? "warn" : "good"}>
							<dt>To check</dt>
							<dd>{problems}</dd>
						</div>
					</dl>

					<OverviewBand
						from={from}
						windowDays={windowDays}
						dayRuns={dayRuns}
						stamps={dated}
						levels={levels}
						onMove={setStart}
						onWindowDays={onWindowDays}
						onOpen={onOpen}
					/>

					<ol className="review-chrono" aria-label="Stamps by date">
						{items.map((item, i) => {
							const begin = item.kind === "stay" ? item.entry : item.stamp;
							const { heading, gap } = marks[i] ?? { heading: null, gap: 0 };
							return (
								<Fragment key={begin.id}>
									{heading ? (
										<li className="review-year" aria-hidden="true">
											{heading}
										</li>
									) : null}
									{gap > 1 ? (
										<li className="review-gap">{plural(gap, "day")} later</li>
									) : null}
									<StayItem item={item} row={row} />
								</Fragment>
							);
						})}
					</ol>
				</>
			)}

			{undated.length > 0 ? (
				<section className="review-undated" aria-label="Stamps without a date">
					<h3>Without a date</h3>
					<div className="review-stay" data-single="true">
						{undated.map((stamp) => (
							<button
								key={stamp.id}
								type="button"
								className="review-row"
								data-jump
								data-severity={levels.get(stamp.id)}
								data-reviewed={stamp.reviewed || undefined}
								aria-label={`Open stamp: ${stampLabel(stamp)}`}
								onClick={() => onOpen(stamp)}
							>
								<CountryTag code={stamp.countryCode} />
								<span
									className="review-row-dir"
									data-direction={stamp.direction}
								>
									{directionIcon(stamp.direction)} {stamp.direction}
								</span>
								<span className="review-row-place">
									{stamp.country ?? "unknown country"}
								</span>
								<span className="review-row-photo">
									{photoNames.get(stamp.photoId)}
								</span>
							</button>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}

function StayItem({
	item,
	row,
}: {
	item: TimelineItem;
	row: (stamp: DatedStamp) => ReactNode;
}) {
	const hueStyle = useHueStyle();
	if (item.kind === "stay")
		return (
			<li className="review-stay" style={hueStyle(item.entry.countryCode)}>
				<div className="review-stay-head">
					<CountryTag code={item.entry.countryCode} />
					{item.exit.countryCode !== item.entry.countryCode ? (
						<CountryTag code={item.exit.countryCode} />
					) : null}
					<strong>
						{item.zone === "Schengen"
							? "Schengen area"
							: (item.entry.country ?? item.entry.countryCode)}
					</strong>
					<span className="review-stay-days">
						{item.days === 0 ? "same day" : plural(item.days, "day")}
					</span>
				</div>
				{row(item.entry)}
				{row(item.exit)}
			</li>
		);
	const { stamp } = item;
	return (
		<li
			className="review-stay"
			data-single="true"
			style={hueStyle(stamp.countryCode)}
		>
			<div className="review-stay-head">
				<CountryTag code={stamp.countryCode} />
				<strong>
					{stamp.country ?? stamp.countryCode ?? "Unknown country"}
				</strong>
				<span className="review-stay-days">
					{stamp.direction === "entry"
						? "no exit stamp"
						: stamp.direction === "exit"
							? "no entry stamp"
							: "direction unknown"}
				</span>
			</div>
			{row(stamp)}
		</li>
	);
}

function StampRow({
	stamp,
	level,
	photoName,
	dayRuns,
	travelDays,
	stripDays,
	index,
	onOpen,
}: {
	stamp: DatedStamp;
	level: Severity;
	photoName: string;
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
	stripDays: number;
	index: PhotoIndex;
	onOpen: (stamp: Stamp) => void;
}) {
	const [nearest] = nearbyPhotos(index, stamp.date, 1);
	return (
		<button
			type="button"
			className="review-row"
			data-jump
			data-severity={level}
			data-reviewed={stamp.reviewed || undefined}
			aria-label={`Open stamp: ${stampLabel(stamp)}`}
			onClick={() => onOpen(stamp)}
		>
			<span className="review-row-dir" data-direction={stamp.direction}>
				{directionIcon(stamp.direction)} {stamp.direction}
			</span>
			<span className="review-row-date">{formatDay(stamp.date)}</span>
			<span className="review-row-place">
				{stamp.location ?? stamp.country ?? "unknown place"}{" "}
				<span aria-hidden="true">{crossingIcon(stamp.borderCrossing)}</span>
			</span>
			<span className="review-row-flags">
				{level === "critical" ? (
					<span className="review-pill" data-tone="bad">
						issue
					</span>
				) : null}
				{level === "warning" ? (
					<span className="review-pill" data-tone="warn">
						photo location
					</span>
				) : null}
				{stamp.reviewed ? (
					<span className="review-pill" data-tone="good">
						✓
					</span>
				) : (
					<span className="review-pill" data-tone="neutral">
						to review
					</span>
				)}
			</span>
			<span className="review-row-photo">{photoName}</span>
			<span className="review-row-evidence">
				<DayStrip
					dayRuns={dayRuns}
					travelDays={travelDays}
					date={stamp.date}
					direction={stamp.direction}
					stampCode={stamp.countryCode}
					radius={stripDays}
				/>
				<span className="review-row-nearest">
					{nearest
						? `Nearest photo: ${nearest.countryCode} ${formatDay(nearest.date)}${nearest.gap ? ` (${plural(nearest.gap, "day")} away)` : " (same day)"}`
						: "No photo locations"}
				</span>
			</span>
		</button>
	);
}

function OverviewBand({
	from,
	windowDays,
	dayRuns,
	stamps,
	levels,
	onMove,
	onWindowDays,
	onOpen,
}: {
	from: number;
	windowDays: number;
	dayRuns: readonly DayRun[];
	stamps: readonly DatedStamp[];
	levels: ReadonlyMap<string, Severity>;
	onMove: (start: number) => void;
	onWindowDays: (days: number) => void;
	onOpen: (stamp: Stamp) => void;
}) {
	const hueStyle = useHueStyle();
	const fromIso = dayIso(from);
	const toIso = dayIso(from + windowDays - 1);
	const runs = runsBetween(dayRuns, fromIso, toIso);
	const inWindow = stamps.filter((s) => s.date >= fromIso && s.date <= toIso);
	const at = (iso: string) => (dayNumber(iso) ?? from) - from;
	const pct = (days: number) => `${(days / windowDays) * 100}%`;

	// Stamps on one day stack upwards instead of covering each other.
	const stack = new Map<string, number>();
	const ticks: { day: number; label: string }[] = [];
	for (let day = from; day < from + windowDays; day++) {
		const iso = dayIso(day);
		if (!iso.endsWith("-01")) continue;
		const month = Number(iso.slice(5, 7));
		ticks.push({
			day: day - from,
			label: month === 1 ? iso.slice(0, 4) : (MONTHS[month - 1] ?? ""),
		});
	}

	return (
		<section className="review-band-card" aria-label="Countries by day">
			<div className="review-band-head">
				<Button onClick={() => onMove(from - windowDays)}>← Earlier</Button>
				<strong className="review-band-range">
					{formatDayRange(fromIso, toIso)}
				</strong>
				<Button onClick={() => onMove(from + windowDays)}>Later →</Button>
				<label className="review-band-window">
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
			<div className="review-band">
				<div className="review-band-pins">
					{inWindow.map((s) => {
						const level = stack.get(s.date) ?? 0;
						stack.set(s.date, level + 1);
						return (
							<button
								key={s.id}
								type="button"
								className="review-pin"
								data-jump
								data-direction={s.direction}
								data-severity={levels.get(s.id)}
								data-reviewed={s.reviewed || undefined}
								aria-label={`Open stamp: ${stampLabel(s)}`}
								title={`${formatDay(s.date)} ${s.direction} ${s.country ?? s.countryCode ?? ""}`}
								style={{
									...hueStyle(s.countryCode),
									left: pct(at(s.date) + 0.5),
									bottom: `${level * 18}px`,
								}}
								onClick={() => onOpen(s)}
							>
								{directionIcon(s.direction)}
							</button>
						);
					})}
				</div>
				<div className="review-band-days">
					{runs.map((run) => {
						const days = at(run.end) - at(run.start) + 1;
						return (
							<span
								key={`${run.start}-${run.countryCode}`}
								className="review-band-run"
								title={`${run.countryCode} · ${formatDayRange(run.start, run.end)}`}
								style={{
									...hueStyle(run.countryCode),
									left: pct(at(run.start)),
									width: pct(days),
								}}
							>
								{days / windowDays > 0.04 ? (
									<>
										<span aria-hidden="true">{flagOf(run.countryCode)}</span>{" "}
										{run.countryCode}
									</>
								) : null}
							</span>
						);
					})}
				</div>
				<div className="review-band-axis" aria-hidden="true">
					{ticks.map((tick) => (
						<span key={tick.day} style={{ left: pct(tick.day) }}>
							{tick.label}
						</span>
					))}
				</div>
			</div>
			<p className="review-muted">
				Coloured blocks: country of each day's photos. Hatched: no photos.
				Markers: stamps; click one to open its photo.
			</p>
		</section>
	);
}
