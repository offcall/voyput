import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Vitest runs from the repository root. */
const MIGRATIONS = resolve("apps/web/src/db/migrations");

/** Import and re-export statements with their module specifier. */
const STATEMENT =
	/(?:^|\n)\s*(import|export)\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']/g;

/** Specifiers whose runtime code a frozen upgrade must not run. */
const isLive = (specifier: string) =>
	specifier.startsWith("@voyput/") ||
	specifier.includes("packages/core") ||
	specifier.includes("features/");

/** Runtime (non-type) imports of live code in one source text. */
function liveImports(source: string): string[] {
	const found: string[] = [];
	for (const [, , type, specifier] of source.matchAll(STATEMENT))
		if (!type && specifier && isLive(specifier)) found.push(specifier);
	for (const [, specifier] of source.matchAll(DYNAMIC))
		if (specifier && isLive(specifier)) found.push(specifier);
	return found;
}

describe("frozen database upgrades (ADR 0039)", () => {
	it("finds runtime imports of live code and lets type imports pass", () => {
		expect(
			liveImports(
				[
					'import { suggestHistory } from "@voyput/core";',
					'import type { TravelStay } from "@voyput/core";',
					'import { x } from "../../features/trips/tripStore";',
					'export { y } from "../../../../packages/core/src/trips/build";',
					'const z = await import("@voyput/core");',
					'import Dexie from "dexie";',
				].join("\n"),
			),
		).toEqual([
			"@voyput/core",
			"../../features/trips/tripStore",
			"../../../../packages/core/src/trips/build",
			"@voyput/core",
		]);
	});

	it("keeps the migrations folder free of live core and feature code", () => {
		const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".ts"));
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const source = readFileSync(join(MIGRATIONS, file), "utf8");
			expect(file).toMatch(/^v\d+\.ts$/);
			expect(source).toContain("Frozen: do not edit.");
			expect({ file, imports: liveImports(source) }).toEqual({
				file,
				imports: [],
			});
		}
	});
});
