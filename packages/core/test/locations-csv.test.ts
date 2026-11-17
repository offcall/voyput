import { describe, expect, it } from "vitest";
import { parseLocationCsv } from "../src/locations/parseLocationCsv";

describe("parseLocationCsv", () => {
	it("keeps quoted commas in one field and skips rows with bad date or coordinates", () => {
		const csv = [
			"﻿date,lat,lon,country_code,country,city,source,is_video,filename,uuid",
			'2019-05-01T10:00:00+03:00,47.01,28.86,md,"Moldova, Republic of",Chisinau,apple,False,a.jpg,u1',
			"2019-05-02T10:00:00,47.0,abc,MD,,,,,b.jpg,u2",
			"not a date,47.0,28.8,MD,,,,,c.jpg,u3",
			'2019-05-03T10:00:00,91,28.8,MD,,,,True,"d ""x"".mov",u4',
			"",
		].join("\r\n");

		const result = parseLocationCsv(csv);

		expect(result).toEqual({
			ok: true,
			skipped: 3,
			rows: [
				{
					date: "2019-05-01T10:00:00+03:00",
					lat: 47.01,
					lon: 28.86,
					countryCode: "MD",
					country: "Moldova, Republic of",
					city: "Chisinau",
					source: "apple",
					isVideo: false,
					filename: "a.jpg",
					uuid: "u1",
				},
			],
		});
	});

	it("reports missing required columns", () => {
		expect(parseLocationCsv("date,latitude,lon\n2019-01-01,1,2\n")).toEqual({
			ok: false,
			missingColumns: ["lat"],
		});
	});

	it("accepts the exporter's microsecond timestamps and rejects an unclosed quote", () => {
		const header = "date,lat,lon,country_code,filename";
		const ok = parseLocationCsv(
			`${header}\n2019-05-01T10:00:00.123456+03:00,47,28,MD,a.jpg\n`,
		);
		expect(ok.ok && ok.rows.length).toBe(1);
		const broken = parseLocationCsv(
			`${header}\n2019-05-01T10:00:00,47,28,MD,"a.jpg\n2019-05-02T10:00:00,47,28,MD,b.jpg\n`,
		);
		expect(broken).toEqual({
			ok: false,
			error: "a quoted field is never closed",
		});
	});

	it("skips rows without a two-letter country code", () => {
		const result = parseLocationCsv(
			"date,lat,lon,country_code\n2019-05-01T10:00:00,47,28,md\n2019-05-02T10:00:00,47,28,\n2019-05-03T10:00:00,47,28,X\n2019-05-04T10:00:00,47,28,123\n",
		);
		expect(result.ok && result.rows.map((r) => r.countryCode)).toEqual(["MD"]);
		expect(result.ok && result.skipped).toBe(3);
	});

	it("takes the country from the coordinates when the file has none", () => {
		const countryAt = (lat: number, lon: number) =>
			lat > 40 ? "FR" : lon > 0 ? "es" : null;
		const result = parseLocationCsv(
			"date,lat,lon,uuid\n2019-05-01T10:00:00+02:00,48.8,2.3,a\n2019-05-02T10:00:00+02:00,39,1,b\n2019-05-03T10:00:00Z,30,-40,sea\n2019-05-04T10:00:00Z,,2.3,bad\n",
			countryAt,
		);
		expect(
			result.ok && result.rows.map((r) => [r.uuid, r.countryCode]),
		).toEqual([
			["a", "FR"],
			["b", "ES"],
		]);
		expect(result.ok && result.skipped).toBe(2);
		expect(
			parseLocationCsv("date,lat,lon\n2019-05-01T10:00:00Z,48.8,2.3\n"),
		).toEqual({ ok: true, rows: [], skipped: 1 });
	});

	it("keeps a code the file has over the coordinates", () => {
		const result = parseLocationCsv(
			"date,lat,lon,country_code\n2019-05-01T10:00:00,47,28,MD\n2019-05-02T10:00:00,47,28,\n",
			() => "RO",
		);
		expect(result.ok && result.rows.map((r) => r.countryCode)).toEqual([
			"MD",
			"RO",
		]);
	});
});
