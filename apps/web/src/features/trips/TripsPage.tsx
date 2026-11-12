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
import { Badge, Button, Card, Stack } from "@voyput/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb } from "../../db/DbContext";
import { AddTripForm } from "./AddTripForm";
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

	return (
		<Stack>
			<h1>Trips</h1>
			{error ? <p role="alert">{error}</p> : null}
			{!data ? (
				<p>Loading…</p>
			) : (
				<>
					<label className="vp-field">
						<span className="vp-field-label">Home country</span>
						<select
							className="vp-input"
							value={home ?? ""}
							onChange={(e) => void run(saveHome(db, e.target.value))}
						>
							{home ? null : <option value="">Choose your home country</option>}
							{COUNTRY_CODES.map((cc) => (
								<option key={cc} value={cc}>
									{regionName(cc)}
								</option>
							))}
						</select>
					</label>
					{home ? null : (
						<p>
							No reviewed stamps or locations yet, so there is nothing to
							suggest. Review stamps, import the location CSV or choose your
							home country.
						</p>
					)}
					<Card title={`Trips (${list.length})`}>
						{list.length === 0 ? <p>No trips found.</p> : null}
						<ul>
							{list.map(({ trip, stored }) => (
								<li key={trip.id}>
									<Button
										onClick={() => setSelectedId(trip.id)}
										aria-pressed={trip.id === selectedId}
									>
										{trip.title}
									</Button>{" "}
									{trip.start} → {trip.end} ·{" "}
									{trip.confirmed ? (
										<Badge tone="good">Confirmed</Badge>
									) : stored ? (
										<Badge tone="warn">Draft</Badge>
									) : (
										<Badge>Suggested</Badge>
									)}
								</li>
							))}
						</ul>
					</Card>
					{selected ? (
						<TripDetail
							key={`${selected.trip.id}:${selected.trip.title}:${selected.trip.start}:${selected.trip.end}`}
							trip={selected.trip}
							stored={selected.stored}
							evidence={evidence}
							stamps={data.stamps}
							onSave={onSave}
							onDelete={onDelete}
						/>
					) : null}
					<AddTripForm onAdd={onAdd} />
				</>
			)}
		</Stack>
	);
}
