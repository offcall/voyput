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

describe("countries tab", () => {
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
		renderApp("/visualize/countries", { db });
		const table = await screen.findByRole("table");
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
});
