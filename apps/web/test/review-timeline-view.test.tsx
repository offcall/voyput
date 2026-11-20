import { render, screen, within } from "@testing-library/react";
import { buildPhotoIndex, type LocationRow, type Stamp } from "@voyput/core";
import { describe, expect, it } from "vitest";
import {
	bandRunTitle,
	runLabel,
	TimelineView,
} from "../src/features/review/TimelineView";

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

const view = (stamps: Stamp[]) =>
	render(
		<TimelineView
			dayRuns={[]}
			travelDays={new Map()}
			index={buildPhotoIndex([])}
			stamps={stamps}
			photoNames={new Map()}
			windowDays={90}
			onWindowDays={() => {}}
			onFrom={() => {}}
			onOpen={() => {}}
		/>,
	);

describe("review timeline view", () => {
	it("shows undated stamps when nothing has a date", () => {
		view([stamp("a", null, "GE", "entry")]);
		const undated = screen.getByRole("region", {
			name: "Stamps without a date",
		});
		expect(within(undated).getAllByRole("button")).toHaveLength(1);
	});

	it("heads each year once and measures gaps from the latest exit", () => {
		const { container } = view([
			stamp("in", "2019-12-28", "GE", "entry"),
			stamp("out", "2020-01-05", "GE", "exit"),
			stamp("tr-in", "2020-01-01", "TR", "entry"),
			stamp("tr-out", "2020-01-02", "TR", "exit"),
			stamp("am-in", "2020-02-01", "AM", "entry"),
		]);
		const years = [...container.querySelectorAll(".review-year")].map(
			(li) => li.textContent,
		);
		expect(years).toEqual(["2019", "2020"]);
		const gaps = [...container.querySelectorAll(".review-gap")].map(
			(li) => li.textContent,
		);
		expect(gaps).toEqual(["27 days later"]);
	});

	it("names the country, the photo count and the days of a band run in its tooltip", () => {
		const photo = (day: string): LocationRow => ({
			date: `${day}T12:00:00+02:00`,
			lat: 0,
			lon: 0,
			countryCode: "DE",
			country: "Germany",
			city: "",
			source: "apple",
			isVideo: false,
			filename: `IMG_${day}.jpg`,
			uuid: day,
		});
		const { container } = render(
			<TimelineView
				dayRuns={[
					{ start: "2024-07-20", end: "2024-07-23", countryCode: "DE" },
				]}
				travelDays={new Map()}
				index={buildPhotoIndex([photo("2024-07-20"), photo("2024-07-23")])}
				stamps={[stamp("in", "2024-07-20", "DE", "entry")]}
				photoNames={new Map()}
				windowDays={90}
				onWindowDays={() => {}}
				onFrom={() => {}}
				onOpen={() => {}}
			/>,
		);
		const run = container.querySelector(".review-band-run");
		expect(run?.getAttribute("title")).toBe(
			"Germany · from 2 photos · 20 Jul – 23 Jul 2024",
		);
	});

	it("joins one country's photo days when no other country's photos lie between", () => {
		const { container } = render(
			<TimelineView
				dayRuns={[
					{ start: "2024-07-01", end: "2024-07-01", countryCode: "DE" },
					{ start: "2024-07-25", end: "2024-07-25", countryCode: "DE" },
					{ start: "2024-07-27", end: "2024-07-27", countryCode: "AT" },
				]}
				travelDays={new Map()}
				index={buildPhotoIndex([])}
				stamps={[stamp("in", "2024-07-01", "DE", "entry")]}
				photoNames={new Map()}
				windowDays={90}
				onWindowDays={() => {}}
				onFrom={() => {}}
				onOpen={() => {}}
			/>,
		);
		const runs = [...container.querySelectorAll(".review-band-run")].map(
			(run) => run.getAttribute("title")?.split(" · ").at(-1),
		);
		expect(runs).toEqual(["1 Jul – 25 Jul 2024", "27 Jul 2024"]);
	});

	it("fills a paired stay's days without photos from its stamps", () => {
		const { container } = render(
			<TimelineView
				dayRuns={[
					{ start: "2024-07-22", end: "2024-07-23", countryCode: "DE" },
				]}
				travelDays={new Map()}
				index={buildPhotoIndex([])}
				stamps={[
					stamp("in", "2024-07-20", "DE", "entry"),
					stamp("out", "2024-08-02", "DE", "exit"),
				]}
				photoNames={new Map()}
				windowDays={90}
				onWindowDays={() => {}}
				onFrom={() => {}}
				onOpen={() => {}}
			/>,
		);
		const runs = [...container.querySelectorAll(".review-band-run")].map(
			(run) => run.getAttribute("data-source"),
		);
		expect(runs).toEqual(["stamps", "photos", "stamps"]);
	});

	it("explains the band's looks in a legend", () => {
		view([stamp("in", "2024-07-20", "DE", "entry")]);
		const legend = screen.getByRole("list", { name: "Legend" });
		expect(
			within(legend)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual([
			"Photos, and days between photos in one country",
			"Stamps: between entry and exit",
			"No data",
			"→←Stamps: entry, exit; click one to open its photo",
		]);
	});
});

describe("band run title", () => {
	it("says where a run comes from", () => {
		expect(
			bandRunTitle(
				{
					start: "2026-11-03",
					end: "2026-11-05",
					countryCode: "RU",
					source: "photos",
				},
				14,
			),
		).toBe("Russia · from 14 photos · 3 Nov – 5 Nov 2026");
		expect(
			bandRunTitle(
				{
					start: "2024-07-21",
					end: "2024-07-25",
					countryCode: "DE",
					source: "stamps",
					entry: "2024-07-20",
					exit: "2024-08-02",
				},
				0,
			),
		).toBe("Germany · between entry 20 Jul and exit 2 Aug 2024 stamps");
	});
});

describe("band run label", () => {
	it("shows flag and code, the code, or nothing by pixel width", () => {
		expect(runLabel(120)).toBe("flag");
		expect(runLabel(44)).toBe("flag");
		expect(runLabel(43.9)).toBe("code");
		expect(runLabel(20)).toBe("code");
		expect(runLabel(19.9)).toBe("none");
		expect(runLabel(0)).toBe("none");
	});
});
