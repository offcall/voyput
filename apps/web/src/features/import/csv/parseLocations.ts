import {
	type CountryLocator,
	type LocationCsvResult,
	parseLocationCsv,
} from "@voyput/core";
import { loadCountryLocator } from "./countryLocator";

/** The parse worker's answer: the parse result, or why it could not parse. */
export type ParseReply =
	| { ok: true; result: LocationCsvResult }
	| { ok: false; error: string };

/** The part of a Worker the import uses; a fake in tests. */
export interface ParseWorker {
	onmessage: ((event: MessageEvent) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage(message: { text: string }): void;
	terminate(): void;
}

/**
 * The worker's message handler: takes `{ text }`, loads the country locator
 * (once per worker, `loadCountryLocator` caches it) and parses the CSV.
 */
export async function handleParseMessage(
	data: unknown,
	loadLocator: () => Promise<CountryLocator> = loadCountryLocator,
): Promise<ParseReply> {
	if (
		typeof data !== "object" ||
		data === null ||
		!("text" in data) ||
		typeof data.text !== "string"
	)
		return { ok: false, error: "expected { text: string }" };
	try {
		return {
			ok: true,
			result: parseLocationCsv(data.text, await loadLocator()),
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

const defaultWorker = (): ParseWorker | null =>
	typeof Worker === "undefined"
		? null
		: new Worker(new URL("./parse.worker.ts", import.meta.url), {
				type: "module",
			});

/** The main-thread path: where no worker runs, or the worker failed. */
const parseHere = async (text: string): Promise<LocationCsvResult> =>
	parseLocationCsv(text, await loadCountryLocator());

/**
 * Parses a location CSV and finds each row's country in a Web Worker, so the
 * 10m outlines load and are searched off the main thread. Where Worker is
 * unavailable (jsdom) or the worker fails (blocked by CSP, a dropped chunk,
 * a failed locator load), it parses on the main thread instead, with the same
 * result.
 */
export function parseLocationFile(
	text: string,
	createWorker: () => ParseWorker | null = defaultWorker,
): Promise<LocationCsvResult> {
	let worker: ParseWorker | null;
	try {
		worker = createWorker();
	} catch {
		worker = null;
	}
	if (!worker) return parseHere(text);
	const running = worker;
	return new Promise<ParseReply>((resolve) => {
		const failed = () => resolve({ ok: false, error: "worker failed" });
		running.onmessage = (event: MessageEvent) => {
			const reply: unknown = event.data;
			if (typeof reply === "object" && reply !== null && "ok" in reply)
				resolve(reply as ParseReply);
			else failed();
		};
		running.onerror = failed;
		running.onmessageerror = failed;
		running.postMessage({ text });
	}).then((reply) => {
		running.terminate();
		return reply.ok ? reply.result : parseHere(text);
	});
}
