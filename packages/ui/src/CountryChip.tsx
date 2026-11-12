/** Number of categorical colours (`--vp-cat-1` … `--vp-cat-10`) in styles.css. */
export const COUNTRY_COLOUR_COUNT = 10;

/** Flag emoji of an ISO 3166-1 alpha-2 code; empty for anything else. */
export function flagEmoji(code: string): string {
	const upper = code.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) return "";
	return String.fromCodePoint(
		...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
	);
}

/** A stable categorical colour for a country code, as a CSS `var(--vp-cat-N)`. */
export function countryColour(code: string): string {
	let hash = 0;
	for (const char of code.trim().toUpperCase())
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return `var(--vp-cat-${(hash % COUNTRY_COLOUR_COUNT) + 1})`;
}

/** A country as a small pill: flag, code in its colour and an optional name. */
export function CountryChip({
	code,
	name,
	colour,
}: {
	/** ISO 3166-1 alpha-2 code, e.g. "UA". */
	code: string;
	name?: string;
	/** Any CSS colour; defaults to countryColour(code). */
	colour?: string;
}) {
	const flag = flagEmoji(code);
	return (
		<span
			className="vp-country"
			style={
				{
					"--vp-country-colour": colour ?? countryColour(code),
				} as React.CSSProperties
			}
		>
			<span className="vp-country-flag" aria-hidden="true">
				{flag || "·"}
			</span>
			<span className="vp-country-code">{code.toUpperCase()}</span>
			{name ? <span className="vp-country-name">{name}</span> : null}
		</span>
	);
}
