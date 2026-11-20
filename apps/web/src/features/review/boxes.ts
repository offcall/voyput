import { type CheckedStamp, severity } from "@voyput/core";
import type { PhotoBox } from "./PhotoViewer";

/** A box's colour: problem red, needs attention orange, reviewed green, else neutral. */
export type BoxTone = "problem" | "attention" | "reviewed" | "open";

export const boxTone = (item: CheckedStamp): BoxTone => {
	const level = severity(item);
	if (level === "critical") return "problem";
	if (level === "warning") return "attention";
	return item.stamp.reviewed ? "reviewed" : "open";
};

/** The boxes of a page's stamps, numbered as their cards; stamps without a box are left out. */
export const photoBoxes = (items: readonly CheckedStamp[]): PhotoBox[] =>
	items.flatMap((item, i) =>
		item.stamp.box
			? [
					{
						stampId: item.stamp.id,
						number: i + 1,
						box: item.stamp.box,
						tone: boxTone(item),
					},
				]
			: [],
	);
