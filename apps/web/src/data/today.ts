/** Today in the browser's time zone, YYYY-MM-DD: the end of a stay still going on. */
export function localToday(now = new Date()): string {
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${m}-${d}`;
}
