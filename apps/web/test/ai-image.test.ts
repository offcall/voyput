import { afterEach, describe, expect, it, vi } from "vitest";
import {
	canvasCodec,
	type DecodedImage,
	fitLongSide,
	type ImageCodec,
	MAX_SENT_LONG_SIDE,
	pageForModel,
} from "../src/ai/image";

describe("fitLongSide", () => {
	it("scales the long side down to the limit, keeping the aspect", () => {
		expect(fitLongSide({ width: 4032, height: 3024 }, 2048)).toEqual({
			width: 2048,
			height: 1536,
		});
		expect(fitLongSide({ width: 3024, height: 4032 }, 2048)).toEqual({
			width: 1536,
			height: 2048,
		});
		expect(fitLongSide({ width: 5000, height: 1 }, 2048)).toEqual({
			width: 2048,
			height: 1,
		});
	});

	it("leaves images within the limit alone", () => {
		expect(fitLongSide({ width: 2048, height: 1536 }, 2048)).toBeNull();
		expect(fitLongSide({ width: 937, height: 1400 }, 2048)).toBeNull();
	});
});

/** Records what would be drawn; no canvas in tests. */
function stubCodec(width: number, height: number) {
	const image: DecodedImage = { width, height, close: vi.fn() };
	const out = new Blob(["drawn"]);
	const codec = {
		decode: vi.fn(async () => image),
		encode: vi.fn(async () => out),
	} satisfies ImageCodec;
	return { codec, image, out };
}

describe("pageForModel", () => {
	it("scales a large page down and sends it as JPEG", async () => {
		const { codec, image, out } = stubCodec(4032, 3024);
		const png = new Blob(["png"], { type: "image/png" });
		expect(await pageForModel(png, 90, codec)).toBe(out);
		expect(codec.encode).toHaveBeenCalledWith(
			image,
			{ width: MAX_SENT_LONG_SIDE, height: 1536 },
			90,
			"image/jpeg",
			0.9,
		);
		expect(image.close).toHaveBeenCalledOnce();
	});

	it("keeps the size and type of a smaller page", async () => {
		const { codec, image } = stubCodec(937, 1400);
		const png = new Blob(["png"], { type: "image/png" });
		await pageForModel(png, 0, codec);
		expect(codec.encode).toHaveBeenCalledWith(
			image,
			{ width: 937, height: 1400 },
			0,
			"image/png",
			0.92,
		);
	});

	it("frees the image when drawing fails", async () => {
		const { codec, image } = stubCodec(100, 100);
		codec.encode.mockRejectedValueOnce(new Error("no canvas"));
		await expect(
			pageForModel(new Blob(["x"], { type: "image/jpeg" }), 0, codec),
		).rejects.toThrow("no canvas");
		expect(image.close).toHaveBeenCalledOnce();
	});
});

/**
 * The canvas codec with jsdom's missing canvas parts stubbed: it records the
 * canvas size and the drawing calls, not pixels (no real canvas in tests).
 */
describe("canvasCodec", () => {
	class FakeBitmap {
		constructor(
			readonly width: number,
			readonly height: number,
		) {}
		close() {}
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function fakeCanvas() {
		const calls: unknown[][] = [];
		const context = {
			imageSmoothingQuality: "low",
			translate: (...args: unknown[]) => calls.push(["translate", ...args]),
			rotate: (...args: unknown[]) => calls.push(["rotate", ...args]),
			drawImage: (_image: unknown, ...args: unknown[]) =>
				calls.push(["drawImage", ...args]),
		};
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => context,
			toBlob: (done: (blob: Blob) => void, type: string, quality: number) => {
				calls.push(["toBlob", type, quality]);
				done(new Blob(["jpeg"], { type }));
			},
		};
		const create = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
			tag === "canvas"
				? (canvas as unknown as HTMLCanvasElement)
				: create(tag)) as typeof document.createElement);
		return { canvas, context, calls };
	}

	it("decodes with the file's EXIF orientation applied", async () => {
		const decode = vi.fn(async () => new FakeBitmap(10, 20));
		vi.stubGlobal("createImageBitmap", decode);
		const blob = new Blob(["x"], { type: "image/jpeg" });
		await canvasCodec.decode(blob);
		expect(decode).toHaveBeenCalledWith(blob, {
			imageOrientation: "from-image",
		});
	});

	it.each([90, 270] as const)(
		"draws an oversized page turned %i° on a sideways canvas, scaled down",
		async (rotation) => {
			vi.stubGlobal("ImageBitmap", FakeBitmap);
			vi.stubGlobal(
				"createImageBitmap",
				async () => new FakeBitmap(4032, 3024),
			);
			const { canvas, context, calls } = fakeCanvas();

			const out = await pageForModel(
				new Blob(["x"], { type: "image/jpeg" }),
				rotation,
			);

			expect(out.type).toBe("image/jpeg");
			// 4032 × 3024 fits into 2048 × 1536; turned sideways the canvas is 1536 × 2048.
			expect([canvas.width, canvas.height]).toEqual([1536, 2048]);
			expect(context.imageSmoothingQuality).toBe("high");
			expect(calls).toEqual([
				["translate", 768, 1024],
				["rotate", (rotation * Math.PI) / 180],
				["drawImage", -1024, -768, 2048, 1536],
				["toBlob", "image/jpeg", 0.9],
			]);
		},
	);

	it("refuses an image it did not decode", () => {
		vi.stubGlobal("ImageBitmap", FakeBitmap);
		const image: DecodedImage = { width: 1, height: 1, close: () => {} };
		expect(() =>
			canvasCodec.encode(image, { width: 1, height: 1 }, 0, "image/png", 0.92),
		).toThrow(/its own images/);
	});
});
