import type { Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/features/review/stays";

const stamp = (
	id: string,
	date: string | null,
	countryCode: string,
	direction: Stamp["direction"],
): Stamp => ({
	id,
	passportId: "p",
	photoId: "ph",
	direction,
	borderCrossing: "plane",
	dateText: "",
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: null,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: false,
});

const shape = (stamps: Stamp[]) =>
	buildTimeline(stamps).map((item) =>
		item.kind === "stay"
			? `${item.entry.id}-${item.exit.id}:${item.days}`
			: item.stamp.id,
	);

describe("review timeline", () => {
	it("pairs each entry with the next exit from the same country", () => {
		expect(
			shape([
				stamp("ua-in", "2016-08-24", "UA", "entry"),
				stamp("es-out", "2016-08-24", "ES", "exit"),
				stamp("es-in", "2016-08-10", "ES", "entry"),
				stamp("ua-out", "2016-08-10", "UA", "exit"),
				stamp("ua-out-2", "2017-01-05", "UA", "exit"),
			]),
		).toEqual(["ua-out", "es-in-es-out:14", "ua-in-ua-out-2:134"]);
	});

	it("keeps unmatched, undirected and undated stamps apart", () => {
		expect(
			shape([
				stamp("a", "2020-01-01", "FR", "entry"),
				stamp("b", "2020-01-03", "FR", "entry"),
				stamp("c", "2020-01-02", "IT", "unknown"),
				stamp("d", null, "DE", "exit"),
			]),
		).toEqual(["a", "c", "b"]);
	});
});
