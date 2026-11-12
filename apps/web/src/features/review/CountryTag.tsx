import type { CSSProperties } from "react";
import { countryColor, flagOf } from "./format";

/** Flag and code on the country's own colour; the code reads where flags do not render. */
export function CountryTag({ code }: { code: string | null }) {
	return (
		<span
			className="review-country"
			data-unknown={code ? undefined : true}
			style={{ "--review-country": countryColor(code) } as CSSProperties}
		>
			<span aria-hidden="true">{flagOf(code)}</span>
			{code ?? "??"}
		</span>
	);
}
