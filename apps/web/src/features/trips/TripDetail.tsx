import {
	type Boundary,
	changePeriod,
	type Stamp,
	type Trip,
	type TripEvidence,
} from "@voyput/core";
import { Badge, Button, Card, TextField } from "@voyput/ui";
import { useState } from "react";
import { DateField, periodError } from "./DateField";

const boundaryText = (b: Boundary) =>
	b.source === "stamp"
		? `${b.date} · stamp · ${b.method}`
		: b.source === "manual"
			? `${b.date} · set by hand`
			: `${b.date} · estimated`;

/** Edit one trip and see what it is made of. */
export function TripDetail({
	trip,
	stored,
	evidence,
	stamps,
	onSave,
	onDelete,
}: {
	trip: Trip;
	stored: boolean;
	evidence: TripEvidence;
	stamps: readonly Stamp[];
	onSave: (trip: Trip) => void;
	onDelete: (trip: Trip) => void;
}) {
	const [title, setTitle] = useState(trip.title);
	const [start, setStart] = useState(trip.start);
	const [end, setEnd] = useState(trip.end);
	const error =
		periodError(start, end) ?? (title.trim() ? null : "Set a title.");
	const draft =
		error || (start === trip.start && end === trip.end)
			? trip
			: changePeriod(trip, evidence, start, end);
	const save = (confirmed: boolean) =>
		onSave({ ...draft, title: title.trim(), confirmed });
	const linked = stamps
		.filter((s) => draft.stampIds.includes(s.id))
		.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

	return (
		<Card title={`Trip: ${trip.title}`}>
			<p>
				{trip.confirmed ? (
					<Badge tone="good">Confirmed</Badge>
				) : stored ? (
					<Badge tone="warn">Draft</Badge>
				) : (
					<Badge>Suggested</Badge>
				)}
			</p>
			<TextField label="Title" value={title} onChange={setTitle} />
			<DateField label="Start" value={start} onChange={setStart} />
			<DateField label="End" value={end} onChange={setEnd} />
			{error ? <p role="alert">{error}</p> : null}
			<p>Arrival: {boundaryText(draft.arrival)}</p>
			<p>Departure: {boundaryText(draft.departure)}</p>
			<div>
				<Button variant="primary" disabled={!!error} onClick={() => save(true)}>
					Confirm
				</Button>{" "}
				<Button disabled={!!error} onClick={() => save(trip.confirmed)}>
					Save
				</Button>{" "}
				<Button variant="danger" onClick={() => onDelete(trip)}>
					Delete
				</Button>
			</div>

			<h3>Stops by day</h3>
			{draft.stops.length === 0 ? (
				<p>No stops in this period.</p>
			) : (
				<table>
					<thead>
						<tr>
							<th>Day</th>
							<th>Country</th>
							<th>Cities</th>
						</tr>
					</thead>
					<tbody>
						{draft.stops.map((s) => (
							<tr key={s.id}>
								<td>{s.day}</td>
								<td>{s.country}</td>
								<td>{s.cities.join(", ") || "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			<h3>Stamps</h3>
			{linked.length === 0 ? (
				<p>No stamps in this period.</p>
			) : (
				<ul>
					{linked.map((s) => (
						<li key={s.id}>
							{s.date} · {s.direction} · {s.country ?? s.countryCode} ·{" "}
							{s.location ?? "unknown place"} · {s.borderCrossing}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
