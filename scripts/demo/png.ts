/**
 * Opaque RGB PNG encoder. resvg writes RGBA with light compression; the pages
 * are opaque, so dropping alpha and using the Paeth filter with zlib level 9
 * makes them about a third smaller, lossless.
 */

import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body) >>> 0);
	return Buffer.concat([length, body, crc]);
}

function paeth(a: number, b: number, c: number): number {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Encodes RGBA pixels (alpha ignored) as an 8-bit RGB PNG. */
export function encodeRgbPng(
	rgba: Uint8Array,
	width: number,
	height: number,
): Buffer {
	const stride = width * 3;
	const raw = Buffer.alloc((stride + 1) * height);
	let prev = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(stride);
		for (let x = 0; x < width; x++)
			for (let c = 0; c < 3; c++)
				row[x * 3 + c] = rgba[(y * width + x) * 4 + c] ?? 0;
		const at = y * (stride + 1);
		raw[at] = 4; // Paeth filter
		for (let i = 0; i < stride; i++) {
			const left = i >= 3 ? (row[i - 3] ?? 0) : 0;
			const upLeft = i >= 3 ? (prev[i - 3] ?? 0) : 0;
			raw[at + 1 + i] =
				((row[i] ?? 0) - paeth(left, prev[i] ?? 0, upLeft)) & 255;
		}
		prev = row;
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bit depth
	header[9] = 2; // colour type: RGB
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}
