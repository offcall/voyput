import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow } from "@voyput/core";
import { describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import {
	seedTrips,
	type TestBoundary,
	type TestStop,
	type TestTrip,
} from "./fixtures/stays";
import { renderApp } from "./renderApp";

const download = vi.hoisted(() =>
	vi.fn<(name: string, text: string) => void>(),
);
vi.mock("../src/features/visualize/explore/download", () => ({
	downloadText: download,
}));

const homePhoto: LocationRow = {
	date: "2023-06-01T12:00:00+03:00",
	lat: 47.0,
	lon: 28.8,
	countryCode: "MD",
	country: "Moldova",
	city: "Chisinau",
	source: "apple",
	isVideo: false,
	filename: "IMG_1.jpg",
	uuid: "photo-1",
};

const edge = (date: string, source: TestBoundary["source"]): TestBoundary => ({
	date,
	source,
	method: "plane",
});

const stops = (
	countryCode: string,
	from: number,
	to: number,
	month: string,
	kind: TestStop["kind"] = "stay",
): TestStop[] =>
	Array.from({ length: to - from + 1 }, (_, i) => {
		const day = `${month}-${String(from + i).padStart(2, "0")}`;
		return {
			id: `${day}|${countryCode}`,
			day,
			countryCode,
			country: countryCode,
			cities: [],
			kind,
		};
	});

const trip = (
	id: string,
	start: string,
	end: string,
	tripStops: TestStop[],
	departure: TestBoundary["source"] = "manual",
): TestTrip => ({
	id,
	title: id,
	start,
	end,
	confirmed: true,
	arrival: edge(start, "manual"),
	departure: edge(end, departure),
	stops: tripStops,
	stampIds: [],
});

/**
 * Home MD. Stays: RO 2023-03-01..05, MD home, JP 2024-06-09..14, KR 15..20
 * (both with a photo-estimated edge), MD home, AT transit on 2024-09-01.
 */
async function seed(): Promise<VoyputDb> {
	const db = new VoyputDb(`explore-${Math.random()}`);
	await db.locations.put(homePhoto);
	await seedTrips(
		db,
		[
			trip(
				"Bucharest",
				"2023-03-01",
				"2023-03-05",
				stops("RO", 1, 5, "2023-03"),
			),
			trip("East Asia", "2024-06-09", "2024-06-20", [
				...stops("JP", 9, 14, "2024-06"),
				...stops("KR", 15, 20, "2024-06"),
			]),
			trip(
				"Vienna",
				"2024-09-01",
				"2024-09-01",
				stops("AT", 1, 1, "2024-09", "transit"),
			),
		],
		"MD",
	);
	return db;
}

/** Value of a KPI tile, e.g. "6" for "Stays". */
const kpi = (label: string) =>
	screen.queryByText(label, { selector: ".vp-stat-label" })?.nextElementSibling
		?.textContent;

const kpis = () => ({
	stays: kpi("Stays"),
	countries: kpi("Countries"),
	days: kpi("Days"),
});

const ALL = { stays: "6", countries: "5", days: "551" };

async function openExplore() {
	const db = await seed();
	renderApp("/visualize/explore", { db });
	await waitFor(() => expect(kpis()).toEqual(ALL));
	const filters = within(screen.getByRole("region", { name: "Filters" }));
	const chip = (group: string, name: RegExp | string) =>
		within(filters.getByRole("group", { name: group })).getByRole("button", {
			name,
		});
	return { filters, chip };
}

describe("visualize explore", () => {
	it("narrows the KPIs with each filter and resets them", async () => {
		const user = userEvent.setup();
		const { filters, chip } = await openExplore();
		const reset = () =>
			user.click(filters.getByRole("button", { name: "Reset filters" }));

		await user.click(chip("Countries", /Romania/));
		// The return day belongs to the home stay that follows.
		expect(kpis()).toEqual({ stays: "1", countries: "1", days: "4" });
		await reset();
		expect(kpis()).toEqual(ALL);

		await user.click(chip("Region", "Asia"));
		expect(kpis()).toEqual({ stays: "2", countries: "2", days: "11" });
		await reset();

		await user.click(chip("Kind", "Transit"));
		expect(kpis()).toEqual({ stays: "1", countries: "1", days: "1" });
		await reset();

		await user.click(chip("Evidence", "Estimated dates"));
		expect(kpis()).toEqual({ stays: "2", countries: "2", days: "11" });
		await reset();

		await user.click(chip("Years", "2023"));
		expect(kpi("Stays")).toBe("2");
		fireEvent.change(filters.getByLabelText("From"), {
			target: { value: "2024-06-09" },
		});
		fireEvent.change(filters.getByLabelText("To"), {
			target: { value: "2024-12-31" },
		});
		expect(kpis()).toEqual({ stays: "4", countries: "4", days: "85" });
		await reset();
		expect(kpis()).toEqual(ALL);
	});

	it("shows an empty state with a reset when nothing matches", async () => {
		const user = userEvent.setup();
		const { chip } = await openExplore();
		await user.click(chip("Countries", /Romania/));
		await user.click(chip("Kind", "Transit"));
		expect(screen.getByText("Nothing matches these filters")).toBeTruthy();
		const main = within(screen.getByRole("main"));
		const resets = main.getAllByRole("button", { name: "Reset filters" });
		await user.click(resets.at(-1) as HTMLElement);
		expect(kpis()).toEqual(ALL);
	});

	it("opens the detail of a selected record and of its country", async () => {
		const user = userEvent.setup();
		await openExplore();
		const table = screen.getByRole("table");
		await user.click(within(table).getByRole("button", { name: /Japan/ }));
		const detail = within(
			screen.getByRole("complementary", { name: "Stay details" }),
		);
		expect(detail.getByRole("heading", { name: "Japan" })).toBeTruthy();
		expect(detail.getByText("2024-06-09 → 2024-06-14")).toBeTruthy();

		await user.click(
			detail.getByRole("button", { name: "All visits to Japan" }),
		);
		const country = within(
			screen.getByRole("complementary", { name: "Country details" }),
		);
		expect(country.getByRole("heading", { name: "Japan" })).toBeTruthy();
		await user.click(country.getByRole("button", { name: "Close" }));
		expect(
			screen.queryByRole("complementary", { name: "Country details" }),
		).toBeNull();
	});

	it("downloads the filtered records as CSV", async () => {
		const user = userEvent.setup();
		download.mockClear();
		const { chip } = await openExplore();
		await user.click(chip("Countries", /Romania/));
		await user.click(screen.getByRole("button", { name: "Download CSV" }));
		expect(download).toHaveBeenCalledTimes(1);
		const [name, text] = download.mock.calls[0] ?? [];
		expect(name).toBe("voyput-stays.csv");
		expect(text).toBe(
			"﻿" +
				[
					'"country","code","start","end","clip_start","clip_end","days","days_in_range","kind","entry_method","entry_source","exit_method","exit_source","stamps","stop_days","place","trip"',
					'"Romania","RO","2023-03-01","2023-03-04","2023-03-01","2023-03-04","4","4","stay","Plane","Set by hand","Plane","Set by hand","0","0","","Romania"',
				].join("\r\n"),
		);
	});
});
