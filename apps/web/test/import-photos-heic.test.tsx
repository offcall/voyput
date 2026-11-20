import { Blob as NodeBlob } from "node:buffer";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DecodedImage, ImageCodec } from "../src/ai/image";
import { VoyputDb } from "../src/db/db";
import {
	type createHeicConverter,
	type HeicConverter,
	type HeicWorker,
	isAppleMobile,
	photoAccept,
} from "../src/features/import/photos/heic";
import { addPhotos } from "../src/features/import/photos/passportStore";
import { renderApp } from "./renderApp";

// jsdom has no object URLs.
let urlCount = 0;
URL.createObjectURL = () => `blob:heic-test-${++urlCount}`;
URL.revokeObjectURL = () => {};

/** The page photos' converter in the app; each test sets what it does. */
const appConverter = vi.hoisted(() => ({
	toJpeg: async (_file: Blob): Promise<Blob> => new Blob(),
}));
vi.mock("../src/features/import/photos/heic", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../src/features/import/photos/heic")
	>()),
	createHeicConverter: () => ({
		toJpeg: (file: Blob) => appConverter.toJpeg(file),
		close: () => {},
	}),
}));
const { createHeicConverter: realConverter } = await vi.importActual<{
	createHeicConverter: typeof createHeicConverter;
}>("../src/features/import/photos/heic");

const heic = (name: string, type = "image/heic") =>
	new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], name, {
		type,
	});
const jpeg = (text = "jpeg") => new Blob([text], { type: "image/jpeg" });

/** A codec that decodes like Safari (an image) or like Chrome (rejects). */
function stubCodec(decodes: boolean) {
	const image: DecodedImage = { width: 4032, height: 3024, close: vi.fn() };
	const out = jpeg("from canvas");
	const codec = {
		decode: vi.fn(async () => {
			if (!decodes) throw new DOMException("unsupported", "InvalidStateError");
			return image;
		}),
		encode: vi.fn(async () => out),
	} satisfies ImageCodec;
	return { codec, image, out };
}

/** A worker that answers each posted photo with `answer`, or fails to start. */
function fakeWorker(answer: () => unknown | "crash") {
	const posted: ArrayBuffer[] = [];
	const worker: HeicWorker & { terminated: boolean } = {
		onmessage: null,
		onerror: null,
		onmessageerror: null,
		terminated: false,
		postMessage(message) {
			posted.push(message);
			const data = answer();
			queueMicrotask(() =>
				data === "crash"
					? worker.onerror?.(
							new ErrorEvent("error", { message: "blocked by CSP" }),
						)
					: worker.onmessage?.(new MessageEvent("message", { data })),
			);
		},
		terminate() {
			worker.terminated = true;
		},
	};
	return { worker, posted };
}

describe("HEIC converter", () => {
	it("uses the browser's own decoder when it reads HEIC (Safari), at full size", async () => {
		const { codec, image, out } = stubCodec(true);
		const createWorker = vi.fn();
		const converter = realConverter(codec, createWorker);

		expect(await converter.toJpeg(heic("IMG_1.HEIC"))).toBe(out);
		expect(codec.encode).toHaveBeenCalledWith(
			image,
			{ width: 4032, height: 3024 },
			0,
			"image/jpeg",
			0.92,
		);
		expect(image.close).toHaveBeenCalled();
		expect(createWorker).not.toHaveBeenCalled();
	});

	it("falls back to one libheif worker for all photos, ended by close", async () => {
		const { codec } = stubCodec(false);
		const answer = jpeg("from worker");
		const { worker, posted } = fakeWorker(() => ({ ok: true, jpeg: answer }));
		const createWorker = vi.fn(() => worker);
		const converter = realConverter(codec, createWorker);

		expect(await converter.toJpeg(heic("IMG_1.HEIC"))).toBe(answer);
		expect(await converter.toJpeg(heic("IMG_2.HEIC"))).toBe(answer);
		expect(createWorker).toHaveBeenCalledTimes(1);
		expect(posted).toHaveLength(2);
		expect(posted[0]).toBeInstanceOf(ArrayBuffer);
		expect(worker.terminated).toBe(false);
		converter.close();
		expect(worker.terminated).toBe(true);
	});

	it("reports a file the worker cannot read and keeps the worker", async () => {
		const { codec } = stubCodec(false);
		const answers = [
			{ ok: false, error: "not a HEIF file" },
			{ ok: true, jpeg: jpeg() },
		];
		const { worker } = fakeWorker(() => answers.shift());
		const createWorker = vi.fn(() => worker);
		const converter = realConverter(codec, createWorker);

		await expect(converter.toJpeg(heic("a.heic"))).rejects.toThrow(
			"not a HEIF file",
		);
		await expect(converter.toJpeg(heic("b.heic"))).resolves.toBeInstanceOf(
			Blob,
		);
		expect(createWorker).toHaveBeenCalledTimes(1);
		expect(worker.terminated).toBe(false);
	});

	it("reports a worker that fails to run and starts a new one for the next photo", async () => {
		const { codec } = stubCodec(false);
		const crashing = fakeWorker(() => "crash");
		const working = fakeWorker(() => ({ ok: true, jpeg: jpeg() }));
		const createWorker = vi
			.fn<() => HeicWorker>()
			.mockReturnValueOnce(crashing.worker)
			.mockReturnValueOnce(working.worker);
		const converter = realConverter(codec, createWorker);

		await expect(converter.toJpeg(heic("a.heic"))).rejects.toThrow(
			"blocked by CSP",
		);
		expect(crashing.worker.terminated).toBe(true);
		await expect(converter.toJpeg(heic("b.heic"))).resolves.toBeInstanceOf(
			Blob,
		);
		expect(createWorker).toHaveBeenCalledTimes(2);
	});
});

describe("photo picker accept list", () => {
	it("names HEIC on desktops, so their pickers show iPhone photos", () => {
		expect(photoAccept(false)).toBe(
			"image/jpeg,image/png,image/heic,image/heif,.heic,.heif",
		);
	});

	it("leaves HEIC out on iPhone and iPad, so iOS hands over JPEG", () => {
		expect(photoAccept(true)).toBe("image/jpeg,image/png");
		const iphone =
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
		const mac =
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
		expect(isAppleMobile({ userAgent: iphone, maxTouchPoints: 5 })).toBe(true);
		expect(isAppleMobile({ userAgent: mac, maxTouchPoints: 5 })).toBe(true);
		expect(isAppleMobile({ userAgent: mac, maxTouchPoints: 0 })).toBe(false);
		expect(
			isAppleMobile({
				userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/140",
				maxTouchPoints: 5,
			}),
		).toBe(false);
	});
});

describe("adding HEIC photos", () => {
	/** A converter that turns each file into a JPEG naming it, or fails for `failing`. */
	const converterFor = (failing: string[] = []): HeicConverter => ({
		toJpeg: vi.fn(async (file: Blob) => {
			const { name } = file as File;
			if (failing.includes(name)) throw new Error("could not decode");
			// Node's Blob survives fake-indexeddb's clone; jsdom's does not.
			return new NodeBlob([`jpeg of ${name}`], {
				type: "image/jpeg",
			}) as unknown as Blob;
		}),
		close: vi.fn(),
	});

	it("stores them as JPEG under their name, reporting progress and each failure", async () => {
		const db = new VoyputDb(`heic-${crypto.randomUUID()}`);
		const converter = converterFor(["broken.heic"]);
		const progress: number[] = [];

		const result = await addPhotos(
			db,
			"p1",
			[
				heic("IMG_1.HEIC"),
				heic("IMG_2.heif", ""),
				heic("broken.heic"),
				new File(["png"], "page.png", { type: "image/png" }),
			],
			{
				onConverting: (count) => progress.push(count),
				createConverter: () => converter,
			},
		);

		expect(progress).toEqual([3, 0]);
		expect(converter.toJpeg).toHaveBeenCalledTimes(3);
		expect(converter.close).toHaveBeenCalledTimes(1);
		expect(result.failed).toEqual([
			{ name: "broken.heic", reason: "could not decode" },
		]);
		const photos = (await db.photos.toArray()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
		expect(photos.map(({ name, mimeType }) => [name, mimeType])).toEqual([
			["IMG_1.HEIC", "image/jpeg"],
			["IMG_2.heif", "image/jpeg"],
			["page.png", "image/png"],
		]);
		expect(new TextDecoder().decode(await photos[0]?.blob.arrayBuffer())).toBe(
			"jpeg of IMG_1.HEIC",
		);
		expect(photos[0]?.blob.type).toBe("image/jpeg");
		expect(photos[0]?.size).toBe(8);
	});

	it("skips a HEIC photo added again before converting it", async () => {
		const db = new VoyputDb(`heic-${crypto.randomUUID()}`);
		const options = { createConverter: () => converterFor() };
		await addPhotos(db, "p1", [heic("IMG_1.HEIC")], options);
		const converter = converterFor();

		const again = await addPhotos(db, "p1", [heic("IMG_1.HEIC")], {
			createConverter: () => converter,
		});

		expect(again.duplicates).toEqual(["IMG_1.HEIC"]);
		expect(converter.toJpeg).not.toHaveBeenCalled();
		expect(await db.photos.count()).toBe(1);
	});

	it("shows the conversion while it runs, then the photo, or the error per file", async () => {
		let finish: (blob: Blob) => void = () => {};
		appConverter.toJpeg = (file) =>
			(file as File).name === "broken.heic"
				? Promise.reject(new Error("not a HEIF file"))
				: new Promise((resolve) => {
						finish = resolve;
					});
		const user = userEvent.setup({ applyAccept: false });
		renderApp("/collect/passports");
		await user.type(await screen.findByLabelText("Passport name"), "Trip");
		await user.click(screen.getByRole("button", { name: "Add passport" }));

		await user.upload(await screen.findByLabelText("Add page photos to Trip"), [
			heic("IMG_1.HEIC"),
			heic("broken.heic"),
		]);

		expect((await screen.findByRole("status")).textContent).toBe(
			"Converting 2 HEIC photos…",
		);
		finish(jpeg());
		const grid = await screen.findByRole("list", { name: "Photos of Trip" });
		await waitFor(() =>
			expect(within(grid).getAllByRole("img")).toHaveLength(1),
		);
		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByRole("alert").textContent).toBe(
			"Could not convert broken.heic to JPEG: not a HEIF file",
		);
	});
});
