import { COUNTRY_CODES, type LegacyTrip } from "@voyput/core";
import { Button, Notice } from "@voyput/ui";
import { useState } from "react";
import { countryName, plural, stayRange } from "./format";

function LegacyRow({
	trip,
	onAdd,
	onForget,
}: {
	trip: LegacyTrip;
	onAdd: (country: string) => void;
	onForget: () => void;
}) {
	const [country, setCountry] = useState("");
	return (
		<li className="vp-stays-legacy-row">
			<span>
				<strong>{trip.title || "Untitled trip"}</strong>{" "}
				<span className="vp-trips-muted">
					{stayRange(trip.start, trip.end)}
				</span>
			</span>
			<select
				className="vp-input"
				aria-label={`Country of ${trip.title || "the trip"}`}
				value={country}
				onChange={(e) => setCountry(e.target.value)}
			>
				<option value="">Choose a country</option>
				{COUNTRY_CODES.map((cc) => (
					<option key={cc} value={cc}>
						{countryName(cc)}
					</option>
				))}
			</select>
			<Button size="sm" disabled={!country} onClick={() => onAdd(country)}>
				Add as stay
			</Button>
			<Button size="sm" variant="ghost" onClick={onForget}>
				Forget
			</Button>
		</li>
	);
}

/** Trips saved before stays that named no country: the user places or drops them. */
export function LegacyTrips({
	trips,
	onAdd,
	onForget,
}: {
	trips: readonly LegacyTrip[];
	onAdd: (trip: LegacyTrip, country: string) => void;
	onForget: (trip: LegacyTrip) => void;
}) {
	if (trips.length === 0) return null;
	return (
		<section className="vp-stays-legacy" aria-label="Trips without a country">
			<Notice tone="warn">
				{plural(trips.length, "trip")} saved before stays had no stops and name
				no country, so {trips.length === 1 ? "it is" : "they are"} not in your
				history. Pick a country to add {trips.length === 1 ? "it" : "each"} as a
				stay, or forget {trips.length === 1 ? "it" : "them"}.
			</Notice>
			<ul className="vp-stays-legacy-list">
				{trips.map((trip) => (
					<LegacyRow
						key={trip.id}
						trip={trip}
						onAdd={(country) => onAdd(trip, country)}
						onForget={() => onForget(trip)}
					/>
				))}
			</ul>
		</section>
	);
}
