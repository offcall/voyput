import { describe, expect, it } from "vitest";
import { describeFailure } from "../src/features/extract/failure";

describe("describeFailure", () => {
	it("tells an unreadable model answer in plain words and keeps the first line as detail", () => {
		const text = describeFailure(
			'invalid model output (stamp 2: bad countryCode "Unknown")\n--- raw response ---\n{}',
		);
		expect(text.summary).toMatch(/could not be read/);
		expect(text.detail).toBe(
			'invalid model output (stamp 2: bad countryCode "Unknown")',
		);
	});

	it("points at Settings for a refused key and at credits for 402", () => {
		expect(
			describeFailure(
				"OpenRouter refused the request (401): check your OpenRouter key in Settings.",
			).summary,
		).toMatch(/Settings/);
		expect(
			describeFailure(
				"OpenRouter says you are out of credits (402). Add credits and retry.",
			).summary,
		).toMatch(/credits/);
	});

	it("falls back to a general line for an unknown message", () => {
		expect(describeFailure("OpenRouter error 502 Bad Gateway").summary).toMatch(
			/service had a problem/,
		);
		expect(describeFailure("something odd").summary).toMatch(/failed/);
	});
});
