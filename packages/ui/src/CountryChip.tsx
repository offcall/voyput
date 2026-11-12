/** Flag emoji of an ISO 3166-1 alpha-2 code; empty for anything else. */
export function flagEmoji(code: string): string {
	const upper = code.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) return "";
	return String.fromCodePoint(
		...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
	);
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
	/** Any CSS colour, e.g. core `countryColor(code)`; neutral when left out. */
	colour?: string | undefined;
}) {
	const flag = flagEmoji(code);
	return (
		<span
			className="vp-country"
			style={
				{
					"--vp-country-colour": colour ?? "var(--vp-muted)",
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
