import { Button, Dialog, TextField } from "@voyput/ui";
import { useState } from "react";
import { DateField, periodError } from "./DateField";

/** A trip the suggestions missed, added from a dialog. */
export function AddTripForm({
	onAdd,
}: {
	onAdd: (title: string, start: string, end: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const error = periodError(start, end);
	return (
		<>
			<Button variant="primary" onClick={() => setOpen(true)}>
				New trip
			</Button>
			<Dialog
				open={open}
				onOpenChange={setOpen}
				title="Add a trip"
				actions={
					<>
						<Button onClick={() => setOpen(false)}>Cancel</Button>
						<Button
							variant="primary"
							disabled={!!error}
							onClick={() => {
								onAdd(title.trim(), start, end);
								setTitle("");
								setStart("");
								setEnd("");
								setOpen(false);
							}}
						>
							Add trip
						</Button>
					</>
				}
			>
				<div className="vp-trips-add">
					<p className="vp-trips-muted">
						For a trip the suggestions missed. Stops and stamps in the period
						are filled in from your data.
					</p>
					<TextField label="New trip title" value={title} onChange={setTitle} />
					<div className="vp-trips-add-dates">
						<DateField
							label="New trip start"
							value={start}
							onChange={setStart}
						/>
						<DateField label="New trip end" value={end} onChange={setEnd} />
					</div>
				</div>
			</Dialog>
		</>
	);
}
