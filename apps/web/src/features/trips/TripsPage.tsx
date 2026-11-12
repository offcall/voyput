import {
	buildTrip,
	COUNTRY_CODES,
	guessHomeCountry,
	suggestTrips,
	type Trip,
	type TripEvidence,
	usableStamps,
	visibleTrips,
} from "@voyput/core";
import { Stack } from "@voyput/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb } from "../../db/DbContext";
import { AddTripForm } from "./AddTripForm";
import { problemCount, tripProblems } from "./conflicts";
import { dayCount, plural } from "./format";
import { buildPhotoDays, photosAbroad } from "./photoDays";
import { TripCard } from "./TripCard";
import { TripsSummary } from "./TripsSummary";
import "./trips.css";
import { TripDetail } from "./TripDetail";
import {
	deleteTrip,
	loadTripsData,
	saveHome,
	saveTrip,
	type TripsData,
} from "./tripStore";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const regionName = (cc: string) => `${regionNames.of(cc) ?? cc} (${cc})`;

export function TripsPage() {
	const db = useDb();
	const [data, setData] = useState<TripsData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const reload = useCallback(
		() =>
			loadTripsData(db)
				.then(setData)
				.catch((e: unknown) =>
					setError(e instanceof Error ? e.message : String(e)),
				),
		[db],
	);
	useEffect(() => {
		void reload();
	}, [reload]);

	const stamps = useMemo(() => usableStamps(data?.stamps ?? []), [data]);
	const home = useMemo(
		() => data?.home ?? guessHomeCountry(stamps, data?.locations ?? []),
		[data, stamps],
	);
	/** Without a home country nothing is suggested, but trips can still be edited. */
	const evidence = useMemo<TripEvidence>(
		() => ({ stamps, locations: data?.locations ?? [], home: home ?? "" }),
		[stamps, data, home],
	);
	const list = useMemo(
		() =>
			data
				? visibleTrips(
						data.stored,
						home ? suggestTrips(evidence) : [],
						data.dismissed,
					)
				: [],
		[data, evidence, home],
	);

	const run = (action: Promise<void>) =>
		action
			.then(reload)
			.catch((e: unknown) =>
				setError(e instanceof Error ? e.message : String(e)),
			);
	const onSave = (trip: Trip) => run(saveTrip(db, trip));
	const onDelete = (trip: Trip) => {
		setSelectedId(null);
		void run(deleteTrip(db, trip));
	};
	const onAdd = (title: string, start: string, end: string) => {
		const built = buildTrip(evidence, start, end);
		const manual = (date: string) =>
			({ date, source: "manual", method: "unknown" }) as const;
		const trip: Trip = {
			...built,
			id: crypto.randomUUID(),
			title: title || built.title,
			arrival: built.arrival.source === "stamp" ? built.arrival : manual(start),
			departure:
				built.departure.source === "stamp" ? built.departure : manual(end),
		};
		setSelectedId(trip.id);
		void run(saveTrip(db, trip));
	};

	const selected = list.find((t) => t.trip.id === selectedId);
	const photoDays = useMemo(
		() => buildPhotoDays(data?.locations ?? []),
		[data],
	);
	const usable = useMemo(() => new Map(stamps.map((s) => [s.id, s])), [stamps]);
	/** Photo and problem counts per trip, computed once per data change. */
	const facts = useMemo(
		() =>
			new Map(
				list.map(({ trip }) => [
					trip.id,
					{
						photos: photosAbroad(photoDays, home ?? "", trip.start, trip.end),
						problems: problemCount(
							tripProblems(trip.stampIds, usable, photoDays),
						),
					},
				]),
			),
		[list, photoDays, home, usable],
	);
	const years = useMemo(() => {
		const byYear = new Map<string, typeof list>();
		for (const item of list) {
			const year = item.trip.start.slice(0, 4);
			byYear.set(year, [...(byYear.get(year) ?? []), item]);
		}
		return [...byYear].sort((a, b) => b[0].localeCompare(a[0]));
	}, [list]);

	return (
		<Stack>
			<div className="vp-trips-top">
				<h1>Trips</h1>
				{data ? (
					<div className="vp-trips-toolbar">
						<label className="vp-trips-home">
							<span>Home country</span>
							<select
								className="vp-input"
								value={home ?? ""}
								onChange={(e) => void run(saveHome(db, e.target.value))}
							>
								{home ? null : (
									<option value="">Choose your home country</option>
								)}
								{COUNTRY_CODES.map((cc) => (
									<option key={cc} value={cc}>
										{regionName(cc)}
									</option>
								))}
							</select>
						</label>
						<AddTripForm onAdd={onAdd} />
					</div>
				) : null}
			</div>
			{error ? <p role="alert">{error}</p> : null}
			{!data ? (
				<p>Loading…</p>
			) : (
				<>
					{home ? null : (
						<p className="vp-trips-note">
							No reviewed stamps or locations yet, so there is nothing to
							suggest. Review stamps, import the location CSV or choose your
							home country.
						</p>
					)}
					<TripsSummary trips={list.map((t) => t.trip)} home={home} />
					<div
						className="vp-trips-layout"
						data-open={selected ? true : undefined}
					>
						<div className="vp-trips-list">
							{list.length === 0 ? (
								<p className="vp-trips-empty">No trips found.</p>
							) : null}
							{years.map(([year, items]) => (
								<section key={year} className="vp-trips-year">
									<h2 className="vp-trips-year-head">
										{year}
										<span>
											{plural(items.length, "trip")} ·{" "}
											{plural(
												items.reduce(
													(sum, { trip }) =>
														sum + dayCount(trip.start, trip.end),
													0,
												),
												"day",
											)}
										</span>
									</h2>
									{items.map(({ trip, stored }) => (
										<TripCard
											key={trip.id}
											trip={trip}
											stored={stored}
											photos={facts.get(trip.id)?.photos ?? 0}
											problems={facts.get(trip.id)?.problems ?? 0}
											selected={trip.id === selectedId}
											onSelect={() => setSelectedId(trip.id)}
										/>
									))}
								</section>
							))}
						</div>
						<div className="vp-trips-pane">
							{selected ? (
								<TripDetail
									key={`${selected.trip.id}:${selected.trip.title}:${selected.trip.start}:${selected.trip.end}`}
									trip={selected.trip}
									stored={selected.stored}
									evidence={evidence}
									stamps={data.stamps}
									photoDays={photoDays}
									onSave={onSave}
									onDelete={onDelete}
								/>
							) : list.length > 0 ? (
								<p className="vp-trips-empty">
									Pick a trip to see its days, stops and stamps.
								</p>
							) : null}
						</div>
					</div>
				</>
			)}
		</Stack>
	);
}
