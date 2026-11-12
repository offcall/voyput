import { countryColor } from "@voyput/core";
import { CountryChip } from "@voyput/ui";

/** Core's colour for a country, muted when the code is unknown. */
export const colourOf = (code: string | null): string =>
	code ? countryColor(code) : "var(--vp-muted)";

/** The kit country chip in core's colour; "??" when the code is unknown. */
export function CountryTag({ code }: { code: string | null }) {
	return <CountryChip code={code ?? "??"} colour={colourOf(code)} />;
}
