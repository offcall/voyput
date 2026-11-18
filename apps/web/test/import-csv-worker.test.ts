import { parseLocationCsv } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { loadCountryLocator } from "../src/features/import/csv/countryLocator";
import {
	handleParseMessage,
	type ParseWorker,
	parseLocationFile,
} from "../src/features/import/csv/parseLocations";

const CSV = [
	"date,lat,lon,uuid",
	"2019-05-01T10:00:00,47.01,28.86,u1",
	"2019-06-10T12:00:00,41.0,29.0,u2",
	"2019-07-01T12:00:00,,29.0,u3",
].join("\n");

const fixedLocator = async () => () => "MD";

/** A worker that answers with `reply`, or fails before answering. */
function fakeWorker(reply: (data: unknown) => Promise<unknown> | "error") {
	const state = { terminated: false, posted: [] as unknown[] };
	const worker: ParseWorker = {
		onmessage: null,
		onerror: null,
		onmessageerror: null,
		postMessage(message) {
			state.posted.push(message);
			const answer = reply(message);
			if (answer === "error") {
				queueMicrotask(() => worker.onerror?.(new ErrorEvent("error")));
				return;
			}
			answer.then((data) =>
				worker.onmessage?.(new MessageEvent("message", { data })),
			);
		},
		terminate() {
			state.terminated = true;
		},
	};
	return { worker, state };
}

describe("CSV parse worker handler", () => {
	it("parses the text with the loaded locator", async () => {
		const reply = await handleParseMessage({ text: CSV }, fixedLocator);
		expect(reply).toEqual({
			ok: true,
			result: parseLocationCsv(CSV, () => "MD"),
		});
		expect(reply.ok && reply.result.ok && reply.result.rows).toHaveLength(2);
	});

	it("passes parse errors back as a result", async () => {
		const reply = await handleParseMessage({ text: "a,b\n1,2" }, fixedLocator);
		expect(reply).toEqual({
			ok: true,
			result: { ok: false, missingColumns: ["date", "lat", "lon"] },
		});
	});

	it("rejects a message without text", async () => {
		expect(await handleParseMessage({ file: 1 }, fixedLocator)).toEqual({
			ok: false,
			error: "expected { text: string }",
		});
	});

	it("reports a failed locator load", async () => {
		const reply = await handleParseMessage({ text: CSV }, () =>
			Promise.reject(new Error("chunk failed")),
		);
		expect(reply).toEqual({ ok: false, error: "chunk failed" });
	});
});

describe("parseLocationFile", async () => {
	const expected = parseLocationCsv(CSV, await loadCountryLocator());

	it("uses the worker's result and terminates it", async () => {
		const { worker, state } = fakeWorker((data) =>
			handleParseMessage(data, loadCountryLocator),
		);
		expect(await parseLocationFile(CSV, () => worker)).toEqual(expected);
		expect(state.posted).toEqual([{ text: CSV }]);
		expect(state.terminated).toBe(true);
	});

	it("parses on the main thread where Worker is unavailable", async () => {
		expect(typeof Worker).toBe("undefined");
		expect(await parseLocationFile(CSV)).toEqual(expected);
	});

	it("falls back to the main thread when the worker fails or cannot start", async () => {
		const failing = fakeWorker(() => "error");
		expect(await parseLocationFile(CSV, () => failing.worker)).toEqual(
			expected,
		);
		expect(failing.state.terminated).toBe(true);
		const refusing = fakeWorker(async () => ({ ok: false, error: "x" }));
		expect(await parseLocationFile(CSV, () => refusing.worker)).toEqual(
			expected,
		);
		const throwing = () => {
			throw new Error("blocked by CSP");
		};
		expect(await parseLocationFile(CSV, throwing)).toEqual(expected);
	});
});
