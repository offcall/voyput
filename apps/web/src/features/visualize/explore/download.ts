/** Saves `text` as a file through a temporary link; the browser's download is the only side effect. */
export function downloadText(
	filename: string,
	text: string,
	type = "text/csv;charset=utf-8",
): void {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
