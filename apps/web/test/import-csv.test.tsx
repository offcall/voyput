import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "./renderApp";

const PICKER = "Drop photo_locations.csv here or pick it";

function csvFile(lines: string[]): File {
	return new File([lines.join("\n")], "photo_locations.csv", {
		type: "text/csv",
	});
}

const OLD_ROW = {
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
};

describe("import location CSV", () => {
	it("stores the rows and shows a summary", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");
		await db.locations.add(OLD_ROW);

		await user.upload(
			await screen.findByLabelText(PICKER),
			csvFile([
				"date,lat,lon,country_code,country,city,source,is_video,filename,uuid",
				'2019-05-01T10:00:00,47.01,28.86,MD,"Moldova, Republic of",Chisinau,apple,False,a.jpg,u1',
				"2019-06-10T12:00:00,41.0,29.0,TR,Türkiye,Istanbul,apple,True,b.mov,u2",
				"2019-07-01T12:00:00,,29.0,TR,Türkiye,Istanbul,apple,False,c.jpg,u3",
			]),
		);

		await screen.findByText(
			"Imported 2 locations · 2 countries · 2019. Skipped 1 rows with a bad date or coordinates, or no country.",
		);
		const stored = screen.getByRole("region", {
			name: "Stored photo locations",
		});
		expect(document.activeElement).toBe(stored);
		await within(stored).findByText("2019–2019");
		expect(
			within(stored)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["🇲🇩MDMoldova, Republic of", "🇹🇷TRTürkiye"]);
		within(stored).getByRole("img", {
			name: "Locations per month, 2019-05 to 2019-06, coloured by country",
		});
		await screen.findByRole("link", {
			name: "Step 2: Photo locations, done, 2 locations",
		});
		const rows = await db.locations.orderBy("date").toArray();
		expect(rows.map((r) => [r.uuid, r.country, r.isVideo])).toEqual([
			["u1", "Moldova, Republic of", false],
			["u2", "Türkiye", true],
		]);
	});

	it("finds countries from the coordinates in the export script's file", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");

		await user.upload(
			await screen.findByLabelText(PICKER),
			csvFile([
				"date,lat,lon,is_video,filename,uuid",
				"2019-05-01T23:30:05+02:00,48.856600,2.352200,false,IMG_0001.HEIC,u1",
				"2019-05-03T00:00:00+01:00,38.722300,-9.139300,true,IMG_0003.MOV,u2",
				"2019-05-04T10:00:00Z,30.000000,-40.000000,false,IMG_0004.JPG,sea",
			]),
		);

		await screen.findByText(/Imported 2 locations · 2 countries · 2019/);
		const rows = await db.locations.orderBy("date").toArray();
		expect(rows.map((r) => [r.uuid, r.countryCode, r.isVideo])).toEqual([
			["u1", "FR", false],
			["u2", "PT", true],
		]);
	});

	it("keeps stored locations when a file is unusable", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");
		await db.locations.add(OLD_ROW);
		const picker = await screen.findByLabelText(PICKER);

		await user.upload(
			picker,
			csvFile(["date,latitude,longitude", "2019-05-01,47,28"]),
		);
		expect((await screen.findByRole("alert")).textContent).toContain(
			"missing required columns: lat, lon",
		);

		await user.upload(
			picker,
			csvFile([
				"date,lat,lon,country_code",
				"05/01/2019,47,28,MD",
				"2019-02-30T10:00:00,47,28,MD",
			]),
		);
		expect(
			(await screen.findByText(/has no valid rows/)).textContent,
		).toContain("Nothing was changed");
		expect(await db.locations.count()).toBe(1);
	});
});
