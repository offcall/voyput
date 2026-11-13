import { CountryChip } from "@voyput/ui";
import { colorOf, countryName } from "./format";

/** Kit country chip in the core country colour, as on Visualize. */
export function TripChip({ code }: { code: string }) {
	return <CountryChip code={code} colour={colorOf(code)} />;
}

/** The first `max` chips and a "+N" tag naming the rest. */
export function TripChips({
	codes,
	max,
}: {
	codes: readonly string[];
	max: number;
}) {
	const shown = codes.length > max ? codes.slice(0, max) : codes;
	const rest = codes.slice(shown.length);
	return (
		<div className="vp-trips-chips">
			{shown.map((cc) => (
				<TripChip key={cc} code={cc} />
			))}
			{rest.length ? (
				<span
					className="vp-trips-chips-more"
					title={rest.map(countryName).join(", ")}
				>
					+{rest.length}
				</span>
			) : null}
		</div>
	);
}
