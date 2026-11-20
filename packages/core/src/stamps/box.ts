import type { Rotation } from "../passports/types";
import type { StampBox } from "./types";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The model's `box` as [x, y, width, height] in 0..1 of the image, clamped to
 * the image; undefined for anything else or a box with no area. Never throws.
 */
export const parseBox = (value: unknown): StampBox | undefined => {
	if (!Array.isArray(value) || value.length !== 4) return undefined;
	if (!value.every((n) => typeof n === "number" && Number.isFinite(n)))
		return undefined;
	const [rawX, rawY, rawW, rawH] = value as [number, number, number, number];
	const x = clamp01(rawX);
	const y = clamp01(rawY);
	// Cut by what sticks out on each side; untouched when nothing does.
	const width = Math.min(1 - x, rawW - (x - rawX));
	const height = Math.min(1 - y, rawH - (y - rawY));
	return width > 0 && height > 0 ? { x, y, width, height } : undefined;
};

/**
 * A box measured on the image turned clockwise by `rotation` (what the model
 * saw), in the stored photo's own unturned frame.
 */
export const unrotateBox = (box: StampBox, rotation: Rotation): StampBox => {
	const { x, y, width, height } = box;
	switch (rotation) {
		case 0:
			return box;
		case 90:
			return { x: y, y: 1 - x - width, width: height, height: width };
		case 180:
			return { x: 1 - x - width, y: 1 - y - height, width, height };
		case 270:
			return { x: 1 - y - height, y: x, width: height, height: width };
	}
};

/** A stamp read from the image turned by `rotation`, with its box in the stored photo's frame. */
export const unrotateStampBox = <T extends { box?: StampBox }>(
	read: T,
	rotation: Rotation,
): T => (read.box ? { ...read, box: unrotateBox(read.box, rotation) } : read);
