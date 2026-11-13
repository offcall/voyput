import { CountryChip } from "@voyput/ui";
import { useCallback } from "react";
import { useCountryColour } from "../../app/countryColours";

/** The app-wide colour of a country, muted when the code is unknown. */
export function useColourOf(): (code: string | null) => string {
	const colour = useCountryColour();
	return useCallback(
		(code: string | null) => (code ? colour(code) : "var(--vp-muted)"),
		[colour],
	);
}

/** The kit country chip in the app-wide colour; "??" when the code is unknown. */
export function CountryTag({ code }: { code: string | null }) {
	const colourOf = useColourOf();
	return <CountryChip code={code ?? "??"} colour={colourOf(code)} />;
}
