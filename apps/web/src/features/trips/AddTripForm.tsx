import { Button, Card, TextField } from "@voyput/ui";
import { useState } from "react";
import { DateField, periodError } from "./DateField";

/** A trip the suggestions missed. */
export function AddTripForm({
	onAdd,
}: {
	onAdd: (title: string, start: string, end: string) => void;
}) {
	const [title, setTitle] = useState("");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const error = periodError(start, end);
	return (
		<Card title="Add a trip">
			<TextField label="New trip title" value={title} onChange={setTitle} />
			<DateField label="New trip start" value={start} onChange={setStart} />
			<DateField label="New trip end" value={end} onChange={setEnd} />
			<Button
				disabled={!!error}
				onClick={() => {
					onAdd(title.trim(), start, end);
					setTitle("");
					setStart("");
					setEnd("");
				}}
			>
				Add trip
			</Button>
		</Card>
	);
}
