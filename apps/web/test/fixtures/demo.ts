import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { VoyputDb } from "../../src/db/db";
import {
	type DemoSummary,
	type FetchFile,
	loadDemo,
} from "../../src/features/demo/loadDemo";

const DEMO_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../public/demo",
);

/** Reads a generated demo file from `apps/web/public/demo`. */
export const readDemoFile: FetchFile = async (name) =>
	new Blob([await readFile(join(DEMO_DIR, name))]);

/** Seeds a test database with the demo passport, stamps and locations. */
export function seedDemo(db: VoyputDb): Promise<DemoSummary> {
	return loadDemo(db, readDemoFile);
}

/**
 * Makes the app's `fetch` of `/demo/<name>` read the file from disk. Returns a
 * bare response object: Node's `Response` cannot wrap a jsdom `Blob`.
 */
export function stubDemoFetch(): void {
	vi.stubGlobal("fetch", async (url: string) => {
		const blob = await readDemoFile(String(url).split("/demo/")[1] ?? "");
		return { ok: true, status: 200, blob: async () => blob };
	});
}

/** jsdom has no object URLs, and blobs read back from fake-indexeddb are not real Blobs. */
export function stubObjectUrls(): void {
	let count = 0;
	vi.spyOn(URL, "createObjectURL").mockImplementation(
		() => `blob:test-${++count}`,
	);
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
}
