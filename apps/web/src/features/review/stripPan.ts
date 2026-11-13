/**
 * The window shift, in days from the stamp date, while a strip is dragged.
 * Content follows the pointer like a map: dragging right brings earlier days.
 */
export const dragShift = (
	startShift: number,
	dx: number,
	pxPerDay: number,
): number => (pxPerDay > 0 ? startShift - dx / pxPerDay : startShift);

/** The nearest whole day, so a strip at rest never shows half days. */
export const snapShift = (shift: number): number => Math.round(shift) + 0;
