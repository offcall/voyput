import type { Trip } from "@voyput/core";
import { Button } from "@voyput/ui";

export function TripFilter({
	trips,
	selected,
	onChange,
}: {
	trips: readonly Trip[];
	selected: ReadonlySet<string>;
	onChange: (selected: Set<string>) => void;
}) {
	if (trips.length === 0) return null;
	const toggle = (id: string) => {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onChange(next);
	};
	return (
		<fieldset className="vp-viz-filter">
			<legend>Trips</legend>
			{trips.map((trip) => (
				<label key={trip.id}>
					<input
						type="checkbox"
						checked={selected.has(trip.id)}
						onChange={() => toggle(trip.id)}
					/>
					{trip.title || "Untitled trip"}{" "}
					<span className="vp-viz-muted">
						{trip.start} – {trip.end}
					</span>
				</label>
			))}
			<Button
				disabled={selected.size === 0}
				onClick={() => onChange(new Set())}
			>
				Show all data
			</Button>
		</fieldset>
	);
}
