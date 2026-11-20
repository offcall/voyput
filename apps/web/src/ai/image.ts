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

/**
 * Longest side, in pixels, of a page photo sent to the model (ADR 0049). A
 * phone photo (4032 × 3024) shrinks to 2048 × 1536; the stored original stays.
 */
export const MAX_SENT_LONG_SIDE = 2048;
/** JPEG quality of a downscaled page. */
const SCALED_QUALITY = 0.9;
/** Quality of a page redrawn at its own size, as before downscaling existed. */
const REDRAW_QUALITY = 0.92;

export interface Size {
	width: number;
	height: number;
}

/** The size that fits `size` into `maxLongSide`, keeping the aspect; null when it fits already. */
export function fitLongSide(size: Size, maxLongSide: number): Size | null {
	const longSide = Math.max(size.width, size.height);
	if (longSide <= maxLongSide) return null;
	const scale = maxLongSide / longSide;
	return {
		width: Math.max(1, Math.round(size.width * scale)),
		height: Math.max(1, Math.round(size.height * scale)),
	};
}

/** A decoded image, its EXIF orientation applied. */
export interface DecodedImage extends Size {
	close(): void;
}

/** Decodes and draws images; the browser one needs a canvas, tests stub it. */
export interface ImageCodec {
	decode(blob: Blob): Promise<DecodedImage>;
	/** Draws `image` at `size`, turned clockwise by `rotation`, and encodes it. */
	encode(
		image: DecodedImage,
		size: Size,
		rotation: Rotation,
		type: string,
		quality: number,
	): Promise<Blob>;
}

export const canvasCodec: ImageCodec = {
	decode: (blob) => createImageBitmap(blob, { imageOrientation: "from-image" }),
	encode(image, size, rotation, type, quality) {
		if (!(image instanceof ImageBitmap))
			throw new Error("the canvas codec draws only its own images");
		const sideways = rotation === 90 || rotation === 270;
		const canvas = document.createElement("canvas");
		canvas.width = sideways ? size.height : size.width;
		canvas.height = sideways ? size.width : size.height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("this browser cannot draw images");
		context.imageSmoothingQuality = "high";
		context.translate(canvas.width / 2, canvas.height / 2);
		context.rotate((rotation * Math.PI) / 180);
		context.drawImage(
			image,
			-size.width / 2,
			-size.height / 2,
			size.width,
			size.height,
		);
		return new Promise((resolve, reject) =>
			canvas.toBlob(
				(result) =>
					result ? resolve(result) : reject(new Error("could not draw photo")),
				type,
				quality,
			),
		);
	},
};

/**
 * Redraws the image turned clockwise by `rotation` degrees. Going through a
 * bitmap also applies the file's EXIF orientation, so the model sees what the
 * user sees. A page larger than MAX_SENT_LONG_SIDE is scaled down and sent as
 * JPEG; a smaller one keeps its size and type.
 */
export async function pageForModel(
	blob: Blob,
	rotation: Rotation,
	codec: ImageCodec = canvasCodec,
): Promise<Blob> {
	const image = await codec.decode(blob);
	try {
		const scaled = fitLongSide(image, MAX_SENT_LONG_SIDE);
		return scaled
			? await codec.encode(
					image,
					scaled,
					rotation,
					"image/jpeg",
					SCALED_QUALITY,
				)
			: await codec.encode(
					image,
					{ width: image.width, height: image.height },
					rotation,
					blob.type === "image/png" ? "image/png" : "image/jpeg",
					REDRAW_QUALITY,
				);
	} finally {
		image.close();
	}
}

/** The photo as a data URL, upright as the user set it and at most MAX_SENT_LONG_SIDE long. */
export const photoDataUrl = async (
	blob: Blob,
	rotation: Rotation,
): Promise<string> => blobToDataUrl(await pageForModel(blob, rotation));
