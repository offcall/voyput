import { describe, expect, it } from "vitest";
import {
	buildPhotoIndex,
	type DayRun,
	type LocationRow,
	mergeBandRuns,
	photosInRun,
} from "../src/index";

const run = (start: string, end: string, countryCode: string): DayRun => ({
	start,
	end,
	countryCode,
});

describe("mergeBandRuns", () => {
	it("keeps photo runs and fills the stay's days without photos from the stamps", () => {
		const runs = mergeBandRuns(
			[run("2024-07-22", "2024-07-24", "DE")],
			[
				{
					start: "2024-07-20",
					end: "2024-07-27",
					zone: "Schengen",
					countryCode: "DE",
				},
			],
		);
		expect(runs).toEqual([
			{
				start: "2024-07-20",
				end: "2024-07-21",
				countryCode: "DE",
				source: "stamps",
				entry: "2024-07-20",
				exit: "2024-07-27",
			},
			{ ...run("2024-07-22", "2024-07-24", "DE"), source: "photos" },
			{
				start: "2024-07-25",
				end: "2024-07-27",
				countryCode: "DE",
				source: "stamps",
				entry: "2024-07-20",
				exit: "2024-07-27",
			},
		]);
	});

	it("lets photos of a side trip win and fills on with the stay's country", () => {
		const runs = mergeBandRuns(
			[run("2026-11-03", "2026-11-04", "KZ")],
			[
				{
					start: "2026-11-01",
					end: "2026-11-06",
					zone: "RU",
					countryCode: "RU",
				},
			],
		);
		expect(runs.map((r) => [r.start, r.end, r.countryCode, r.source])).toEqual([
			["2026-11-01", "2026-11-02", "RU", "stamps"],
			["2026-11-03", "2026-11-04", "KZ", "photos"],
			["2026-11-05", "2026-11-06", "RU", "stamps"],
		]);
	});

	it("fills a Schengen stay with the last Schengen country seen in photos", () => {
		const runs = mergeBandRuns(
			[run("2024-07-03", "2024-07-03", "FR")],
			[
				{
					start: "2024-07-01",
					end: "2024-07-05",
					zone: "Schengen",
					countryCode: "DE",
				},
			],
		);
		expect(runs.map((r) => [r.start, r.countryCode, r.source])).toEqual([
			["2024-07-01", "DE", "stamps"],
			["2024-07-03", "FR", "photos"],
			["2024-07-04", "FR", "stamps"],
		]);
	});

	it("fills nothing without a paired stay, and a day only once", () => {
		const photos = [run("2024-01-01", "2024-01-02", "MD")];
		expect(mergeBandRuns(photos, [])).toEqual([
			{ ...photos[0], source: "photos" },
		]);
		const stay = {
			start: "2024-02-01",
			end: "2024-02-03",
			zone: "TR",
			countryCode: "TR",
		};
		const twice = mergeBandRuns([], [stay, { ...stay, end: "2024-02-05" }]);
		expect(twice.map((r) => [r.start, r.end])).toEqual([
			["2024-02-01", "2024-02-03"],
			["2024-02-04", "2024-02-05"],
		]);
	});
});

describe("photosInRun", () => {
	const row = (day: string, countryCode: string): LocationRow => ({
		date: `${day}T12:00:00+02:00`,
		lat: 0,
		lon: 0,
		countryCode,
		country: "",
		city: "",
		source: "apple",
		isVideo: false,
		filename: `IMG_${day}.jpg`,
		uuid: `${day}-${countryCode}`,
	});

	it("counts the run country's photos on its days only", () => {
		const index = buildPhotoIndex([
			row("2026-11-02", "RU"),
			row("2026-11-03", "RU"),
			row("2026-11-03", "RU"),
			row("2026-11-05", "KZ"),
			row("2026-11-05", "RU"),
			row("2026-11-06", "RU"),
		]);
		expect(photosInRun(index, run("2026-11-03", "2026-11-05", "RU"))).toBe(3);
	});
});
