/**
 * Prints the CSP source (`'sha256-…'`) of every inline <script> in an HTML file,
 * for the `script-src` of docs/deploy.md. Run after changing the inline theme
 * script in apps/web/index.html, then paste the new hash into docs/deploy.md
 * (apps/web/test/site-head.test.ts fails until it matches):
 *
 *   node --experimental-strip-types scripts/csp-hash.ts [apps/web/index.html]
 *
 * Vite copies the script into dist/index.html unchanged, so the source file
 * and the build give the same hash; pass apps/web/dist/index.html to check.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The text of each <script> without a `src`, exactly as the browser hashes it. */
export function inlineScripts(html: string): string[] {
	return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
		.filter(([, attrs]) => !/\ssrc\s*=/i.test(attrs ?? ""))
		.map(([, , body]) => body ?? "");
}

export function cspHash(script: string): string {
	return `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const file = process.argv[2] ?? "apps/web/index.html";
	for (const script of inlineScripts(readFileSync(file, "utf8")))
		console.log(cspHash(script));
}
