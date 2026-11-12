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

	it("pairs across the Schengen area as one zone", () => {
		expect(
			shape([
				stamp("es-in", "2019-03-01", "ES", "entry"),
				stamp("it-out", "2019-03-11", "IT", "exit"),
			]),
		).toEqual(["es-in-it-out:10"]);
	});

	it("orders same-day stamps the same whatever the input order", () => {
		const day = [
			stamp("fr-out", "2019-05-01", "FR", "exit"),
			stamp("de-out", "2019-05-01", "DE", "exit"),
			stamp("fr-in", "2019-05-01", "FR", "entry"),
		];
		const first = shape(day);
		expect(first.filter((s) => s.includes(":"))).toHaveLength(1);
		expect(shape([...day].reverse())).toEqual(first);
		expect(shape([day[1], day[2], day[0]] as Stamp[])).toEqual(first);
	});
});
