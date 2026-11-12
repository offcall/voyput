import type { Rotation } from "@voyput/core";

const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	const chunk = 0x8000;
	for (let start = 0; start < bytes.length; start += chunk) {
		binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
	}
	return btoa(binary);
};

export const blobToDataUrl = async (blob: Blob): Promise<string> =>
	`data:${blob.type || "application/octet-stream"};base64,${toBase64(
		new Uint8Array(await blob.arrayBuffer()),
	)}`;

/** Draws the image turned clockwise by `rotation` degrees. Needs a browser canvas. */
const rotate = async (blob: Blob, rotation: Rotation): Promise<Blob> => {
	const bitmap = await createImageBitmap(blob);
	const sideways = rotation === 90 || rotation === 270;
	const canvas = document.createElement("canvas");
	canvas.width = sideways ? bitmap.height : bitmap.width;
	canvas.height = sideways ? bitmap.width : bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("this browser cannot draw images");
	context.translate(canvas.width / 2, canvas.height / 2);
	context.rotate((rotation * Math.PI) / 180);
	context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
	bitmap.close();
	const type = blob.type === "image/png" ? "image/png" : "image/jpeg";
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(result) =>
				result ? resolve(result) : reject(new Error("could not rotate photo")),
			type,
			0.92,
		),
	);
};

/** The photo as a data URL, upright as the user set it. */
export const photoDataUrl = async (
	blob: Blob,
	rotation: Rotation,
): Promise<string> =>
	blobToDataUrl(rotation === 0 ? blob : await rotate(blob, rotation));
