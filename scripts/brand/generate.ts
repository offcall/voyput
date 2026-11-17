/**
 * Writes the favicon set and the share image into apps/web/public:
 * favicon.svg, favicon.ico (32 px), apple-touch-icon.png (180 px),
 * icon-192.png, icon-512.png (web app manifest) and og.png (1200×630).
 *
 * Run from the repo root:
 *   node --experimental-strip-types scripts/brand/generate.ts
 *
 * Text is set in the app's own Silkscreen (the @fontsource WOFF, unpacked to
 * TrueType for resvg), not a system font, so the output is the same on any machine.
 * resvg-js 2.6 ignores `fontBuffers`, so the font goes through a temp file.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import { iconSvg, ogSvg } from "./art.ts";

const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../apps/web/public",
);

/** Unpacks a WOFF 1.0 font into the TrueType/OpenType file it wraps. */
function woffToSfnt(woff: Buffer): Buffer {
	if (woff.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF");
	const count = woff.readUInt16BE(12);
	const tables = Array.from({ length: count }, (_, i) => {
		const at = 44 + i * 20;
		const offset = woff.readUInt32BE(at + 4);
		const packed = woff.readUInt32BE(at + 8);
		const length = woff.readUInt32BE(at + 12);
		const raw = woff.subarray(offset, offset + packed);
		return {
			tag: woff.subarray(at, at + 4),
			checksum: woff.readUInt32BE(at + 16),
			data: packed < length ? inflateSync(raw) : raw,
		};
	});
	const power = 2 ** Math.floor(Math.log2(count));
	const head = Buffer.alloc(12 + count * 16);
	woff.copy(head, 0, 4, 8);
	head.writeUInt16BE(count, 4);
	head.writeUInt16BE(power * 16, 6);
	head.writeUInt16BE(Math.log2(power), 8);
	head.writeUInt16BE(count * 16 - power * 16, 10);
	const bodies: Buffer[] = [];
	let offset = head.length;
	tables.forEach((table, i) => {
		const at = 12 + i * 16;
		table.tag.copy(head, at);
		head.writeUInt32BE(table.checksum, at + 4);
		head.writeUInt32BE(offset, at + 8);
		head.writeUInt32BE(table.data.length, at + 12);
		const padded = Buffer.alloc(Math.ceil(table.data.length / 4) * 4);
		table.data.copy(padded);
		bodies.push(padded);
		offset += padded.length;
	});
	return Buffer.concat([head, ...bodies]);
}

/** An ICO file holding one PNG image (valid since Windows Vista, read by every browser). */
function icoOf(png: Buffer, size: number): Buffer {
	const head = Buffer.alloc(22);
	head.writeUInt16BE(0, 0);
	head.writeUInt16LE(1, 2);
	head.writeUInt16LE(1, 4);
	head.writeUInt8(size % 256, 6);
	head.writeUInt8(size % 256, 7);
	head.writeUInt16LE(1, 10);
	head.writeUInt16LE(32, 12);
	head.writeUInt32LE(png.length, 14);
	head.writeUInt32LE(head.length, 18);
	return Buffer.concat([head, png]);
}

const require = createRequire(import.meta.url);
const fontDir = mkdtempSync(join(tmpdir(), "voyput-brand-"));
const silkscreen = join(fontDir, "silkscreen.ttf");
writeFileSync(
	silkscreen,
	woffToSfnt(
		readFileSync(
			require.resolve(
				"@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff",
			),
		),
	),
);

const png = (svg: string) =>
	new Resvg(svg, {
		font: {
			fontFiles: [silkscreen],
			loadSystemFonts: false,
			defaultFontFamily: "Silkscreen",
		},
	})
		.render()
		.asPng();

try {
	writeFileSync(join(OUT, "favicon.svg"), iconSvg(32));
	writeFileSync(join(OUT, "favicon.ico"), icoOf(png(iconSvg(32)), 32));
	writeFileSync(
		join(OUT, "apple-touch-icon.png"),
		png(iconSvg(180, { opaque: true })),
	);
	writeFileSync(join(OUT, "icon-192.png"), png(iconSvg(192)));
	writeFileSync(join(OUT, "icon-512.png"), png(iconSvg(512)));
	writeFileSync(join(OUT, "og.png"), png(ogSvg()));
} finally {
	rmSync(fontDir, { recursive: true, force: true });
}
