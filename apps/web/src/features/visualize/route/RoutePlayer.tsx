import {
	adjacentStayStart,
	buildTimeline,
	COUNTRY_CENTROIDS,
	createFlownPath,
	currentWaypoint,
	currentWaypointIndex,
	DEFAULT_CLUSTER_RADIUS_KM,
	dayNumber,
	headingAt,
	journeyDayAt,
	type LocationRow,
	legsDone,
	legsPathD,
	legValue,
	type MapView,
	projectEquirect,
	revealedGroups,
	routeLegDurations,
	type Stay,
	stayStarts,
	stayYears,
	type Waypoint,
	type WorldShapes,
	ZOOM_PRESETS,
	type ZoomPreset,
	zoomView,
} from "@voyput/core";
import { Button, Stat, StatGroup } from "@voyput/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { fitView } from "../charts/view";
import { usePhone } from "../usePhone";
import { type Bubble, RouteMap } from "./RouteMap";
import {
	type PlayerMode,
	type RouteYear,
	timingMode,
	useCountryNames,
	useRouteWaypoints,
} from "./routeData";
import { usePlayback } from "./usePlayback";
import { useReducedMotion } from "./useReducedMotion";

export const SPEEDS = [1, 4, 8, 16] as const;

const MODES: { value: PlayerMode; label: string }[] = [
	{ value: "journey", label: "Stays & photos" },
	{ value: "countries", label: "By countries" },
	{ value: "photos", label: "Exact by photos" },
];

const PRESETS: { value: ZoomPreset; label: string }[] = [
	{ value: "world", label: "World" },
	{ value: "europe", label: "Europe" },
	{ value: "asia", label: "Asia" },
	{ value: "americas", label: "Americas" },
];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	year: "numeric",
	timeZone: "UTC",
});

function formatDay(iso: string): string {
	const date = new Date(`${iso}T00:00:00Z`);
	return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

function formatRange(start: string, end: string): string {
	return start === end
		? formatDay(start)
		: `${formatDay(start)} – ${formatDay(end)}`;
}

/** Where a country's bubble sits: its centroid, else its first waypoint. */
function bubbleAnchors(
	waypoints: readonly Waypoint[],
): Map<string, [number, number]> {
	const anchors = new Map<string, [number, number]>();
	for (const w of waypoints) {
		if (anchors.has(w.countryCode)) continue;
		const centroid = COUNTRY_CENTROIDS[w.countryCode];
		anchors.set(
			w.countryCode,
			centroid ? projectEquirect(centroid[0], centroid[1]) : [w.x, w.y],
		);
	}
	return anchors;
}

/** The fitted view around the route's countries, as a `MapView`. */
function fitRoute(waypoints: readonly Waypoint[], aspect = 2): MapView {
	return fitView([...new Set(waypoints.map((w) => w.countryCode))], aspect);
}

function Pills<T extends string | number>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: readonly { value: T; label: string }[];
	value: T | null;
	onChange: (value: T) => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset.
		<div className="vp-route-pills" role="group" aria-label={label}>
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					className="vp-route-pill"
					aria-pressed={option.value === value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

/** The world-map route player for a set of stays and photo locations. */
export function RoutePlayer({
	stays,
	locations,
	world,
}: {
	stays: readonly Stay[];
	locations: readonly LocationRow[];
	world: WorldShapes | null;
}) {
	const reduced = useReducedMotion();
	const phone = usePhone();
	const colour = useCountryColour();
	const nameOf = useCountryNames(stays, locations);
	const [mode, setMode] = useState<PlayerMode>("journey");
	const [year, setYear] = useState<RouteYear>("all");
	const years = useMemo(() => stayYears([...stays]), [stays]);

	const route = useRouteWaypoints(stays, locations, mode, year);
	const { waypoints, stayIds } = route;
	const timeline = useMemo(
		() => buildTimeline(routeLegDurations(waypoints, timingMode(mode))),
		[waypoints, mode],
	);
	const playback = usePlayback(timeline, { reduced, autoplay: true });
	const { position } = playback;
	const legCount = timeline.durations.length;

	// The map's width / height: a phone's tall map gets a fit of its own shape.
	const [aspect, setAspect] = useState(2);
	const [view, setView] = useState<MapView>(() => fitRoute(waypoints));
	const [viewOwner, setViewOwner] = useState({ waypoints, aspect });
	if (viewOwner.waypoints !== waypoints || viewOwner.aspect !== aspect) {
		setViewOwner({ waypoints, aspect });
		setView(fitRoute(waypoints, aspect));
	}
	const onView = useCallback(
		(update: (view: MapView) => MapView) => setView(update),
		[],
	);

	const done = legsDone(position);
	const anchors = useMemo(() => bubbleAnchors(waypoints), [waypoints]);
	const maxDays = useMemo(
		() =>
			Math.max(1, ...revealedGroups(waypoints, Infinity).map((g) => g.days)),
		[waypoints],
	);
	const bubbles = useMemo<Bubble[]>(
		() =>
			revealedGroups(waypoints, done).map((g) => {
				const [x, y] = anchors.get(g.countryCode) ?? [0, 0];
				return { ...g, x, y, name: nameOf(g.countryCode) };
			}),
		[waypoints, done, anchors, nameOf],
	);
	const reached = useMemo(() => bubbles.map((b) => b.countryCode), [bubbles]);
	const totalCountries = anchors.size;

	const flown = useRef(createFlownPath());
	const flownD = flown.current.update(waypoints, done);
	const currentD =
		legCount > 0 && done < legCount
			? legsPathD(waypoints, position.legIndex, position.legIndex + 1)
			: "";

	const stop = currentWaypoint(waypoints, position);
	const starts = useMemo(() => stayStarts(stayIds), [stayIds]);
	const stayCountries = useMemo(
		() => new Map(stays.map((s) => [s.id, s.country])),
		[stays],
	);
	const stayId = stayIds[currentWaypointIndex(waypoints.length, position)];
	const stayNumber =
		stayId == null
			? 0
			: starts.filter(
					(i) => i <= currentWaypointIndex(waypoints.length, position),
				).length;
	const at = legValue(position);
	const previousStay = adjacentStayStart(starts, at, -1);
	const nextStay = adjacentStayStart(starts, at, 1);
	const today = journeyDayAt(waypoints, position);

	// The traveller keeps its last heading while parked on a stop.
	const heading = useRef(0);
	heading.current = headingAt(waypoints, position) ?? heading.current;
	const first = waypoints[0];
	const dayOf = (w: Waypoint | undefined) => {
		const a = first ? dayNumber(first.start) : null;
		const b = w ? dayNumber(w.end) : null;
		return a === null || b === null ? 0 : b - a + 1;
	};

	const yearOptions: { value: string; label: string }[] = [
		{ value: "all", label: "All years" },
		...years.map((y) => ({ value: String(y), label: String(y) })),
	];

	const stayCaption =
		mode === "photos" || stayId == null ? null : (
			<span className="vp-route-stop-trip">
				Stay {stayNumber}/{starts.length}
				{stayCountries.get(stayId) ? ` · ${stayCountries.get(stayId)}` : ""}
			</span>
		);

	const stopLabel = stop ? (
		<div className="vp-route-stop" aria-live="polite">
			<span
				className="vp-route-chip"
				aria-hidden="true"
				style={{ background: colour(stop.countryCode) }}
			>
				{stop.countryCode}
			</span>
			<span>
				{stayCaption}
				<strong className="vp-route-stop-name">
					{nameOf(stop.countryCode)}
				</strong>
				<span className="vp-route-stop-dates">
					{formatRange(stop.start, stop.end)}
					{stop.photos > 0
						? ` · ${stop.photos} ${stop.photos === 1 ? "photo" : "photos"}`
						: ""}
				</span>
			</span>
		</div>
	) : null;

	const stayButton = (step: -1 | 1, text: string) => {
		const target = step < 0 ? previousStay : nextStay;
		return (
			<button
				type="button"
				className="vp-route-pill"
				aria-label={step < 0 ? "Previous stay" : "Next stay"}
				disabled={target === null}
				onClick={() => target !== null && playback.jump(target)}
			>
				{text}
			</button>
		);
	};
	const playButton = (
		<Button
			variant="primary"
			onClick={playback.playing ? playback.pause : playback.play}
			disabled={legCount === 0}
			className="vp-route-play"
		>
			{playback.playing ? "Pause" : "Play"}
		</Button>
	);
	const scrubber = (
		<input
			type="range"
			className="vp-route-scrub"
			aria-label="Position on the route"
			min={0}
			max={legCount}
			step="any"
			value={at}
			aria-valuetext={today ? formatDay(today) : undefined}
			disabled={legCount === 0}
			onChange={(event) => playback.seek(Number(event.target.value))}
		/>
	);
	const date = today ? (
		<time className="vp-route-date" dateTime={today}>
			{formatDay(today)}
		</time>
	) : null;
	const nextSpeed =
		SPEEDS[
			(SPEEDS.indexOf(playback.speed as (typeof SPEEDS)[number]) + 1) %
				SPEEDS.length
		] ?? 1;

	// Phones: two thumb rows under the map; the same controls, the speed as one button.
	const phoneControls = (
		<div className="vp-route-player vp-route-player-phone">
			<div className="vp-route-row">
				{playButton}
				{mode === "photos" ? null : (
					// biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
					<div className="vp-route-pills" role="group" aria-label="Stays">
						{stayButton(-1, "‹")}
						{stayButton(1, "›")}
					</div>
				)}
				<button
					type="button"
					className="vp-route-pill vp-route-icon"
					aria-label="Restart"
					disabled={legCount === 0}
					onClick={playback.restart}
				>
					↺
				</button>
				<button
					type="button"
					className="vp-route-pill vp-route-icon"
					aria-label={`Speed ${playback.speed}×, change to ${nextSpeed}×`}
					onClick={() => playback.setSpeed(nextSpeed)}
				>
					{playback.speed}×
				</button>
			</div>
			<div className="vp-route-row">
				{scrubber}
				{date}
			</div>
		</div>
	);

	const desktopControls = (
		<div className="vp-route-player">
			{playButton}
			<Button
				variant="secondary"
				onClick={playback.restart}
				disabled={legCount === 0}
			>
				Restart
			</Button>
			{mode === "photos" ? null : (
				// biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset.
				<div className="vp-route-pills" role="group" aria-label="Stays">
					{stayButton(-1, "< Stay")}
					{stayButton(1, "Stay >")}
				</div>
			)}
			{scrubber}
			{date}
			<Pills<number>
				label="Speed"
				options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
				value={playback.speed}
				onChange={playback.setSpeed}
			/>
		</div>
	);

	return (
		<div className="vp-route">
			<div className="vp-route-toolbar">
				<Pills
					label="Route mode"
					options={MODES}
					value={mode}
					onChange={setMode}
				/>
				<label className="vp-route-select">
					<span className="vp-visually-hidden">Range</span>
					<select
						value={String(year)}
						onChange={(event) => {
							const value = event.target.value;
							setYear(value === "all" ? "all" : Number(value));
						}}
					>
						{yearOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<span className="vp-route-spacer" />
				<Pills
					label="Zoom to"
					options={PRESETS}
					value={null}
					onChange={(preset) => setView(ZOOM_PRESETS[preset])}
				/>
				{/* biome-ignore lint/a11y/useSemanticElements: a group of buttons, not a form fieldset. */}
				<div className="vp-route-pills" role="group" aria-label="Zoom">
					<button
						type="button"
						className="vp-route-pill"
						aria-label="Fit the route"
						onClick={() => setView(fitRoute(waypoints, aspect))}
					>
						Fit
					</button>
					<button
						type="button"
						className="vp-route-pill"
						aria-label="Zoom in"
						onClick={() => setView((v) => zoomView(v, 0.7))}
					>
						+
					</button>
					<button
						type="button"
						className="vp-route-pill"
						aria-label="Zoom out"
						onClick={() =>
							setView((v) =>
								v[2] / 0.7 > ZOOM_PRESETS.world[2] * 1.01
									? ZOOM_PRESETS.world
									: zoomView(v, 1 / 0.7),
							)
						}
					>
						−
					</button>
				</div>
			</div>

			{waypoints.length === 0 ? (
				<p className="vp-viz-muted">
					{mode === "photos"
						? "No photo locations in this range."
						: "No stays with a place on the map in this range."}
				</p>
			) : (
				<>
					<RouteMap
						world={world}
						waypoints={waypoints}
						position={position}
						heading={heading.current}
						flownD={flownD}
						currentD={currentD}
						bubbles={bubbles}
						reached={reached}
						maxDays={maxDays}
						colour={colour}
						view={view}
						onView={onView}
						onAspect={setAspect}
						overlay={phone ? null : stopLabel}
					/>
					{phone ? stopLabel : null}

					{phone ? phoneControls : desktopControls}

					<StatGroup>
						<Stat
							label="Countries"
							value={`${bubbles.length} / ${totalCountries}`}
						/>
						<Stat label="Day" value={dayOf(stop).toLocaleString("en-US")} />
						<Stat
							label="Legs"
							value={`${Math.min(done, legCount)} / ${legCount}`}
						/>
					</StatGroup>

					<p className="vp-viz-muted">
						{mode === "journey"
							? `${waypoints.length.toLocaleString("en-US")} stops: in each stay ${route.photos.toLocaleString("en-US")} photos grouped within ${DEFAULT_CLUSTER_RADIUS_KM * 1000} m.`
							: mode === "photos"
								? `${waypoints.length.toLocaleString("en-US")} stops from ${route.photos.toLocaleString("en-US")} photos, grouped within ${DEFAULT_CLUSTER_RADIUS_KM * 1000} m.`
								: "One stop per stay, at the country's centre; lines are the order of stays, not real paths."}{" "}
						Long flights take longer than short hops. Drag to pan, scroll or
						pinch to zoom.
						{route.skipped > 0
							? ` ${route.skipped} ${route.skipped === 1 ? "stay has" : "stays have"} no place on the map.`
							: ""}
					</p>
				</>
			)}
		</div>
	);
}
