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
			missingColumns: ["lat", "country_code"],
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
});
