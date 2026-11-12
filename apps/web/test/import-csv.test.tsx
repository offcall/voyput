import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp";

const PICKER = "Drop photo_locations.csv here or pick it";

function csvFile(lines: string[]): File {
	return new File([lines.join("\n")], "photo_locations.csv", {
		type: "text/csv",
	});
}

describe("import location CSV", () => {
	it("stores the rows and shows a summary", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/");
		await db.locations.add({
			date: "2001-01-01T00:00:00",
			lat: 1,
			lon: 1,
			countryCode: "XX",
			country: "",
			city: "",
			source: "",
			isVideo: false,
			filename: "old.jpg",
			uuid: "old",
		});

		await user.upload(
			await screen.findByLabelText(PICKER),
			csvFile([
				"date,lat,lon,country_code,country,city,source,is_video,filename,uuid",
				'2019-05-01T10:00:00,47.01,28.86,MD,"Moldova, Republic of",Chisinau,apple,False,a.jpg,u1',
				"2019-06-10T12:00:00,41.0,29.0,TR,Türkiye,Istanbul,apple,True,b.mov,u2",
				"2019-07-01T12:00:00,,29.0,TR,Türkiye,Istanbul,apple,False,c.jpg,u3",
			]),
		);

		expect(
			(await screen.findByText(/Imported 2 locations/)).textContent,
		).toMatch(/from 2019-05-01 to 2019-06-10 in 2 countries\. Skipped 1 rows/);
		const rows = await db.locations.orderBy("date").toArray();
		expect(rows.map((r) => [r.uuid, r.country, r.isVideo])).toEqual([
			["u1", "Moldova, Republic of", false],
			["u2", "Türkiye", true],
		]);
	});

	it("rejects a file with missing columns and stores nothing", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/");

		await user.upload(
			await screen.findByLabelText(PICKER),
			csvFile(["date,latitude,longitude", "2019-05-01,47,28"]),
		);

		expect((await screen.findByRole("alert")).textContent).toContain(
			"missing required columns: lat, lon, country_code",
		);
		expect(await db.locations.count()).toBe(0);
	});
});
