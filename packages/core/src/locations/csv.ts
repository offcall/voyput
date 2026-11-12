/**
 * Splits CSV text into rows of fields (RFC 4180 style). Quoted fields may hold
 * commas, newlines and doubled quotes, e.g. "Moldova, Republic of".
 * Blank lines are dropped; a leading byte-order mark is ignored.
 */
export function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;

	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c !== '"') field += c;
			else if (text[i + 1] === '"') {
				field += '"';
				i++;
			} else inQuotes = false;
		} else if (c === '"') inQuotes = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (c !== "\r") field += c;
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
