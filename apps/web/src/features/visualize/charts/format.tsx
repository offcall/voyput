/** Regional-indicator flag emoji for a two-letter country code. */
export function flag(code: string): string {
	if (!/^[A-Za-z]{2}$/.test(code)) return "";
	return [...code.toUpperCase()]
		.map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
		.join("");
}

export function formatInt(n: number): string {
	return Math.round(n).toLocaleString("en-US");
}

export const OTHER_COLOR = "#8a8a94";

export function NoData() {
	return <p className="vp-viz-muted">No data.</p>;
}
