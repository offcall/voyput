import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

let n = 0;
const photo = (
	day: string,
	countryCode: string,
	country: string,
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 45,
	lon: 27,
	countryCode,
	country,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${++n}.jpg`,
	uuid: `countries-${n}`,
});

describe("countries on Stats", () => {
	it("sorts by any column and keeps the photo rank", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("visualize-countries-sort");
		await db.locations.bulkPut([
			photo("2022-05-01", "BG", "Bulgaria"),
			photo("2024-01-02", "RO", "Romania"),
			photo("2024-01-03", "RO", "Romania"),
			photo("2023-01-04", "AT", "Austria"),
			photo("2024-01-04", "AT", "Austria"),
			photo("2024-01-05", "AT", "Austria"),
		]);
		renderApp("/insights/stats", { db });
		const table = await screen.findByRole("table", {
			name: /Countries by photos/,
		});
		const names = () =>
			within(table)
				.getAllByRole("row")
				.slice(1)
				.map((row) => row.querySelector(".vp-country-name")?.textContent);
		await waitFor(() =>
			expect(names()).toEqual(["Austria", "Romania", "Bulgaria"]),
		);
		expect(
			within(table).getByRole("row", { name: /Austria 3 50%/ }),
		).toBeTruthy();

		const sortBy = (name: string) =>
			user.click(
				within(table).getByRole("button", { name: new RegExp(`^${name}`) }),
			);
		await sortBy("Years");
		expect(names()).toEqual(["Bulgaria", "Austria", "Romania"]);
		await sortBy("Country");
		expect(names()).toEqual(["Austria", "Bulgaria", "Romania"]);
		await sortBy("Country");
		expect(names()).toEqual(["Romania", "Bulgaria", "Austria"]);
		expect(
			within(table)
				.getByRole("columnheader", { name: /Country/ })
				.getAttribute("aria-sort"),
		).toBe("descending");
		// The rank is by photos whatever the order.
		const ranks = within(table)
			.getAllByRole("row")
			.slice(1)
			.map((row) => row.querySelector("td")?.textContent);
		expect(ranks).toEqual(["2", "3", "1"]);
	});

	it("shows the top 10 countries first and all of them on request", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("visualize-countries-show-all");
		const codes = [
			"AT",
			"BE",
			"BG",
			"CH",
			"CZ",
			"DE",
			"DK",
			"EE",
			"ES",
			"FI",
			"FR",
			"GR",
		];
		// More photos for earlier codes, so the rank is fixed; a month apart, one stay each.
		await db.locations.bulkPut(
			codes.flatMap((code, i) =>
				Array.from({ length: codes.length - i }, (_, k) =>
					photo(
						`2024-${String(i + 1).padStart(2, "0")}-${String(k + 1).padStart(2, "0")}`,
						code,
						code,
					),
				),
			),
		);
		renderApp("/insights/stats", { db });
		const table = await screen.findByRole("table", {
			name: /Countries by photos/,
		});
		const rows = () => within(table).getAllByRole("row").slice(1);
		await waitFor(() => expect(rows()).toHaveLength(10));
		const panel = table.closest("figure") as HTMLElement;
		await user.click(
			within(panel).getByRole("button", { name: "Show all 12" }),
		);
		expect(rows()).toHaveLength(12);
		await user.click(
			within(panel).getByRole("button", { name: "Show top 10" }),
		);
		expect(rows()).toHaveLength(10);

		// Ranked bar lists start short too.
		const top = screen.getByRole("list", { name: "Top countries" });
		expect(within(top).getAllByRole("listitem")).toHaveLength(10);
		await user.click(
			within(top.parentElement as HTMLElement).getByRole("button", {
				name: "Show all 12",
			}),
		);
		expect(within(top).getAllByRole("listitem")).toHaveLength(12);
	});
});
