import type { PhotoMimeType, Rotation } from "./types";

/** File extensions we accept when the browser reports no MIME type. */
const EXTENSION_TYPES: Record<string, PhotoMimeType> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
};

/** The supported MIME type of a picked or dropped file, or null for anything else (HEIC, PDF…). */
export function photoMimeType(file: {
	name: string;
	type: string;
}): PhotoMimeType | null {
	if (file.type === "image/jpeg" || file.type === "image/png") return file.type;
	if (file.type !== "") return null;
	const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
	return EXTENSION_TYPES[extension] ?? null;
}

const HEIF_TYPES = new Set([
	"image/heic",
	"image/heif",
	"image/heic-sequence",
	"image/heif-sequence",
]);

/**
 * True for a HEIC/HEIF photo (an iPhone's default), by MIME type or, since
 * some browsers report none for it, by the .heic/.heif extension. The import
 * turns these into JPEG before storing them.
 */
export function isHeifPhoto(file: { name: string; type: string }): boolean {
	if (HEIF_TYPES.has(file.type.toLowerCase())) return true;
	return (
		(file.type === "" || file.type === "application/octet-stream") &&
		/\.(heic|heif)$/i.test(file.name)
	);
}

/** Rotates by `delta` degrees (a multiple of 90, may be negative), wrapping into 0–270. */
export function rotateBy(rotation: Rotation, delta: number): Rotation {
	const next = (((rotation + delta) % 360) + 360) % 360;
	if (next === 0 || next === 90 || next === 180 || next === 270) return next;
	throw new Error(`Rotation must be a multiple of 90, got ${delta}`);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
