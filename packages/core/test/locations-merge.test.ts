import { describe, expect, it } from "vitest";
import { mergeLocations } from "../src/locations/merge";
import { parseLocationCsv } from "../src/locations/parseLocationCsv";
import type { LocationRow } from "../src/locations/types";

const row = (over: Partial<LocationRow>): LocationRow => ({
	date: "2020-03-01T10:00:00Z",
	lat: 10,
	lon: 20,
	countryCode: "XX",
	country: "",
	city: "",
	source: "",
	isVideo: false,
	filename: "",
	uuid: "a",
	...over,
});

const parse = (lines: string[]) => {
	const result = parseLocationCsv(lines.join("\n"));
	if (!result.ok) throw new Error("synthetic CSV must parse");
	return result.rows;
};

describe("mergeLocations", () => {
	it("drops rows whose uuid is stored, keeps rows with another uuid", () => {
		const stored = [row({ uuid: "a" }), row({ uuid: "b", lat: 11 })];
		const incoming = [
			row({ uuid: "a", lat: 50 }),
			// Same second and place, but both have their own uuid: two photos.
			row({ uuid: "c" }),
			row({ uuid: "c" }),
		];
		const merge = mergeLocations(stored, incoming);
		expect(merge.added.map((r) => r.uuid)).toEqual(["c"]);
		expect(merge.duplicates).toBe(2);
		expect(merge.uuids).toEqual(["a", "c"]);
	});

	it("without a uuid, matches the same UTC second within 50 m", () => {
		const stored = [row({ uuid: "u1", date: "2020-03-01T10:00:00Z" })];
		const incoming = parse([
			"date,lat,lon,country_code",
			// The same instant in another offset, a fraction later, 30 m north.
			"2020-03-01T12:00:00.400+02:00,10.00027,20,XX",
			// Same instant, about 110 m away.
			"2020-03-01T10:00:00Z,10.001,20,XX",
			// Same place, one second later.
			"2020-03-01T10:00:01Z,10,20,XX",
		]);
		const merge = mergeLocations(stored, incoming);
		expect(merge.duplicates).toBe(1);
		expect(merge.added.map((r) => r.date)).toEqual([
			"2020-03-01T10:00:00Z",
			"2020-03-01T10:00:01Z",
		]);
		expect(merge.uuids[0]).toBe("u1");
	});

	it("matches by time and place when neither file has uuids", () => {
		const stored = parse([
			"date,lat,lon,country_code,filename",
			"2020-03-01T10:00:00Z,10,20,XX,a.jpg",
		]);
		const incoming = parse([
			"date,lat,lon,country_code,filename",
			"2020-03-01T10:00:00Z,10,20,XX,b.jpg",
			"2020-03-01T10:00:00Z,10,20,XX,a.jpg",
		]);
		const merge = mergeLocations(stored, incoming);
		expect(merge.added).toEqual([]);
		expect(merge.duplicates).toBe(2);
		expect(merge.uuids).toEqual([stored[0]?.uuid, stored[0]?.uuid]);
	});
});
