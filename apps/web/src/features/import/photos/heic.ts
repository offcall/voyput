import { SUPPORTED_PHOTO_TYPES } from "@voyput/core";
import { canvasCodec, type ImageCodec } from "../../../ai/image";

/** JPEG quality of a converted HEIC photo (ADR 0052). */
export const HEIC_JPEG_QUALITY = 0.92;

/** The HEIC worker's answer: the JPEG, or why it could not convert. */
export type HeicReply = { ok: true; jpeg: Blob } | { ok: false; error: string };

/** The part of a Worker the converter uses; a fake in tests. */
export interface HeicWorker {
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage(message: ArrayBuffer, transfer: Transferable[]): void;
	terminate(): void;
}

/** Turns HEIC/HEIF photos into JPEG, one at a time; `close` ends its worker. */
export interface HeicConverter {
	toJpeg(file: Blob): Promise<Blob>;
	close(): void;
}

/** Starts the libheif worker; its chunk and wasm load only now (ADR 0052). */
const defaultWorker = (): HeicWorker =>
	new Worker(new URL("./heic.worker.ts", import.meta.url), { type: "module" });

/**
 * A converter that lets the browser decode the photo when it can (Safari),
 * drawing it to a JPEG on a canvas with no download; elsewhere it decodes in
 * a libheif Web Worker, started on the first photo that needs it and kept
 * for the next ones until `close`. Callers convert one photo at a time.
 */
export function createHeicConverter(
	codec: ImageCodec = canvasCodec,
	createWorker: () => HeicWorker = defaultWorker,
): HeicConverter {
	let worker: HeicWorker | null = null;

	const inBrowser = async (file: Blob): Promise<Blob | null> => {
		let image: Awaited<ReturnType<ImageCodec["decode"]>>;
		try {
			image = await codec.decode(file);
		} catch {
			return null;
		}
		try {
			return await codec.encode(
				image,
				{ width: image.width, height: image.height },
				0,
				"image/jpeg",
				HEIC_JPEG_QUALITY,
			);
		} finally {
			image.close();
		}
	};

	const inWorker = async (file: Blob): Promise<Blob> => {
		const buffer = await file.arrayBuffer();
		worker ??= createWorker();
		const running = worker;
		const reply = await new Promise<HeicReply>((resolve) => {
			const failed = (error: string) => {
				// A crashed worker is not reused; the next photo starts a new one.
				running.terminate();
				if (worker === running) worker = null;
				resolve({ ok: false, error });
			};
			running.onmessage = (event: MessageEvent) => {
				const data: unknown = event.data;
				if (
					typeof data === "object" &&
					data !== null &&
					"ok" in data &&
					(data.ok === false || ("jpeg" in data && data.jpeg instanceof Blob))
				)
					resolve(data as HeicReply);
				else failed("unexpected answer from the HEIC decoder");
			};
			running.onerror = (event) =>
				failed(event.message || "the HEIC decoder could not start");
			running.onmessageerror = () => failed("the HEIC decoder failed");
			running.postMessage(buffer, [buffer]);
		});
		if (!reply.ok) throw new Error(reply.error);
		return reply.jpeg;
	};

	return {
		async toJpeg(file) {
			return (await inBrowser(file)) ?? inWorker(file);
		},
		close() {
			worker?.terminate();
			worker = null;
		},
	};
}

/** True on iPhone and iPad, iPadOS included (it reports itself as a Mac). */
export function isAppleMobile(nav: {
	userAgent: string;
	maxTouchPoints: number;
}): boolean {
	return (
		/iPhone|iPad|iPod/.test(nav.userAgent) ||
		(/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
	);
}

/**
 * The file input's `accept` for page photos. iOS turns HEIC photos into JPEG
 * itself when the list does not name HEIC, so there it names only JPEG and
 * PNG; elsewhere it adds HEIC/HEIF so desktop pickers show those files
 * (ADR 0052).
 */
export function photoAccept(appleMobile: boolean): string {
	const heif = appleMobile
		? []
		: ["image/heic", "image/heif", ".heic", ".heif"];
	return [...SUPPORTED_PHOTO_TYPES, ...heif].join(",");
}
