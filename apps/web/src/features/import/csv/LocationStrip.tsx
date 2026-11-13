import { useCountryColour } from "../../../app/countryColours";
import type { LocationPeriod } from "./storedLocations";

/** One bar per month (or year), stacked by country, so the stored history shows at a glance. */
export function LocationStrip({ periods }: { periods: LocationPeriod[] }) {
	const countryColor = useCountryColour();
	if (periods.length === 0) return null;
	const max = Math.max(...periods.map((period) => period.rows));
	const first = periods[0]?.key ?? "";
	const last = periods.at(-1)?.key ?? "";
	const unit = first.length === 4 ? "year" : "month";
	return (
		<figure className="import-strip">
			<div
				className="import-strip-bars"
				role="img"
				aria-label={`Locations per ${unit}, ${first} to ${last}, coloured by country`}
			>
				{periods.map((period) => (
					<div
						key={period.key}
						className="import-strip-bar"
						title={describe(period)}
						style={{
							// Square root, so quiet months stay visible next to busy ones.
							height: `${period.rows ? Math.max(6, Math.sqrt(period.rows / max) * 100) : 0}%`,
						}}
					>
						{period.countries.map((country) => (
							<span
								key={country.code}
								style={{
									flexGrow: country.rows,
									background: countryColor(country.code),
								}}
							/>
						))}
					</div>
				))}
			</div>
			<figcaption className="import-strip-axis" aria-hidden="true">
				<span>{first}</span>
				<span>per {unit}</span>
				<span>{last}</span>
			</figcaption>
		</figure>
	);
}

function describe(period: LocationPeriod): string {
	if (period.rows === 0) return `${period.key}: no locations`;
	const countries = period.countries
		.map((country) => `${country.code} ${country.rows}`)
		.join(", ");
	return `${period.key}: ${period.rows.toLocaleString("en")} locations (${countries})`;
}
