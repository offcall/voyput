import { colorOf, countryName, flagOf } from "./format";

/** Country code on its colour, with the flag; the full name on hover. */
export function CountryChip({ code }: { code: string }) {
	return (
		<span
			className="vp-trips-chip"
			style={{ background: colorOf(code) }}
			title={countryName(code)}
		>
			<span aria-hidden="true">{flagOf(code)}</span>
			{code}
		</span>
	);
}

/** Countries of the stops, in the order they were first visited. */
export const tripCountries = (stops: readonly { countryCode: string }[]) => [
	...new Set(stops.map((s) => s.countryCode)),
];
