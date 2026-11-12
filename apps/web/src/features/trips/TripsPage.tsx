import {
	buildTrip,
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

	const evidence = useMemo<TripEvidence | null>(() => {
		if (!data) return null;
		const stamps = usableStamps(data.stamps);
		const home = data.home ?? guessHomeCountry(stamps, data.locations);
		return home ? { stamps, locations: data.locations, home } : null;
	}, [data]);
	const countries = useMemo(() => {
		const all = new Set<string>();
		for (const s of evidence?.stamps ?? []) all.add(s.countryCode);
		for (const l of evidence?.locations ?? []) all.add(l.countryCode);
		return [...all].sort();
	}, [evidence]);
	const list = useMemo(
		() =>
			data && evidence
				? visibleTrips(data.stored, suggestTrips(evidence), data.dismissed)
				: [],
		[data, evidence],
	);

	const run = (action: Promise<void>) =>
		action
			.then(reload)
			.catch((e: unknown) =>
				setError(e instanceof Error ? e.message : String(e)),
			);
	const onSave = (trip: Trip) => run(saveTrip(db, trip));
	const onDelete = (id: string) => {
		setSelectedId(null);
		void run(deleteTrip(db, id));
	};
	const onAdd = (title: string, start: string, end: string) => {
		if (!evidence) return;
		const built = buildTrip(evidence, start, end);
		const trip: Trip = {
			...built,
			id: crypto.randomUUID(),
			title: title || built.title,
			arrival: { date: start, source: "manual", method: "unknown" },
			departure: { date: end, source: "manual", method: "unknown" },
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
			) : !evidence ? (
				<p>
					No reviewed stamps or locations yet. Review stamps or import the
					location CSV first.
				</p>
			) : (
				<>
					<label className="vp-field">
						<span className="vp-field-label">Home country</span>
						<select
							className="vp-input"
							value={evidence.home}
							onChange={(e) => void run(saveHome(db, e.target.value))}
						>
							{countries.map((cc) => (
								<option key={cc} value={cc}>
									{cc}
								</option>
							))}
						</select>
					</label>
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
