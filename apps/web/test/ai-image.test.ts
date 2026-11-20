import { describe, expect, it, vi } from "vitest";
import {
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
