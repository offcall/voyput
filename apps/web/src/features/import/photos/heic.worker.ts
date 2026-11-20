/**
 * Web Worker: decodes one HEIC/HEIF photo at a time with libheif (WebAssembly)
 * and encodes it as JPEG (ADR 0052). Takes the file's bytes as an ArrayBuffer,
 * answers a `HeicReply`. The wasm file is fetched once, on the first photo.
 */
import createLibheif from "libheif-js/libheif-wasm/libheif.js";
import wasmUrl from "libheif-js/libheif-wasm/libheif.wasm?url";
import { HEIC_JPEG_QUALITY, type HeicReply } from "./heic";

/** The part of libheif-js's JavaScript API this worker uses (not in its .d.ts). */
interface HeifImage {
	get_width(): number;
	get_height(): number;
	display(
		target: { data: Uint8ClampedArray; width: number; height: number },
		done: (result: unknown) => void,
	): void;
	free(): void;
}
interface Libheif {
	HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
}

const isLibheif = (value: unknown): value is Libheif =>
	typeof value === "object" &&
	value !== null &&
	"HeifDecoder" in value &&
	typeof value.HeifDecoder === "function";

let libheif: Promise<Libheif> | null = null;

const loadLibheif = (): Promise<Libheif> => {
	libheif ??= fetch(wasmUrl)
		.then((response) => {
			if (!response.ok)
				throw new Error(`could not load the HEIC decoder (${response.status})`);
			return response.arrayBuffer();
		})
		.then((wasmBinary) => {
			const module: unknown = createLibheif({ wasmBinary });
			if (!isLibheif(module)) throw new Error("the HEIC decoder did not load");
			return module;
		});
	// A failed load (network, CSP) is tried again on the next photo.
	libheif.catch(() => {
		libheif = null;
	});
	return libheif;
};

/**
 * The photo's primary image as JPEG at full size. libheif applies the HEIF
 * rotation and mirroring, so the pixels are upright as the camera meant.
 */
async function toJpeg(bytes: ArrayBuffer): Promise<Blob> {
	const { HeifDecoder } = await loadLibheif();
	const images = new HeifDecoder().decode(new Uint8Array(bytes));
	const [image] = images;
	if (!image) throw new Error("not a readable HEIC/HEIF image");
	try {
		const width = image.get_width();
		const height = image.get_height();
		const pixels = new Uint8ClampedArray(width * height * 4);
		const decoded = await new Promise<unknown>((resolve) =>
			image.display({ data: pixels, width, height }, resolve),
		);
		if (!decoded) throw new Error("could not decode the HEIC image");
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("this browser cannot draw images");
		context.putImageData(new ImageData(pixels, width, height), 0, 0);
		return await canvas.convertToBlob({
			type: "image/jpeg",
			quality: HEIC_JPEG_QUALITY,
		});
	} finally {
		for (const each of images) each.free();
	}
}

/** The worker global scope, as far as this worker uses it. */
const scope = self as unknown as {
	onmessage: ((event: MessageEvent) => void) | null;
	postMessage(message: HeicReply): void;
};

scope.onmessage = (event) => {
	const data: unknown = event.data;
	const answer =
		data instanceof ArrayBuffer
			? toJpeg(data)
			: Promise.reject(new Error("expected the photo's bytes"));
	answer.then(
		(jpeg) => scope.postMessage({ ok: true, jpeg }),
		(error: unknown) =>
			scope.postMessage({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}),
	);
};
