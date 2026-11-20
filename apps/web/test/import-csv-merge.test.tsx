import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LocationRow } from "@voyput/core";
import { describe, expect, it } from "vitest";
import { addResultText } from "../src/features/import/csv/locationFiles";
import { renderApp } from "./renderApp";

const PICKER = "Drop photo_locations.csv here or pick it";
const HEADER = "date,lat,lon,country_code,filename,uuid";

const csvFile = (name: string, lines: string[]) =>
	new File([[HEADER, ...lines].join("\n")], name, { type: "text/csv" });

const FIRST = csvFile("mac.csv", [
	"2020-03-01T10:00:00Z,10,20,XX,a.jpg,u1",
	"2020-03-02T10:00:00Z,10,20,XX,b.jpg,u2",
]);

async function importFirst(user: ReturnType<typeof userEvent.setup>) {
	await user.upload(await screen.findByLabelText(PICKER), FIRST);
	await screen.findByText(/Imported 2 locations/);
}

const uuids = async (rows: Promise<LocationRow[]>) =>
	(await rows).map((row) => row.uuid).sort();

describe("several location files", () => {
	it("adds a second file, drops rows with a stored uuid and lists both files", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");
		await importFirst(user);

		await user.upload(
			screen.getByLabelText(PICKER),
			csvFile("other.csv", [
				"2020-03-02T10:00:00Z,10,20,XX,b.jpg,u2",
				"2020-03-05T10:00:00Z,10,20,XX,c.jpg,u3",
			]),
		);
		await user.click(
			await screen.findByRole("button", { name: "Add to them" }),
		);

		await screen.findByText(
			"Added 1 new photo location, 1 was already there. Total 3 from 2 files.",
		);
		expect(await uuids(db.locations.toArray())).toEqual(["u1", "u2", "u3"]);
		const list = await screen.findByRole("list", { name: "Imported files" });
		await waitFor(() =>
			expect(within(list).getAllByRole("listitem")).toHaveLength(2),
		);
		within(list).getByText(/2 rows · 2020-03-02 to 2020-03-05 · imported/);

		// Removing the second file deletes only the row no other file has.
		await user.click(
			within(list).getByRole("button", { name: "Remove other.csv" }),
		);
		await user.click(
			await screen.findByRole("button", { name: "Remove file" }),
		);
		await waitFor(async () =>
			expect(await uuids(db.locations.toArray())).toEqual(["u1", "u2"]),
		);
	});

	it("matches rows without a uuid by second and place", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");
		await importFirst(user);

		await user.upload(
			screen.getByLabelText(PICKER),
			csvFile("no-uuids.csv", [
				// u1 again, in another offset, about 20 m away.
				"2020-03-01T11:00:00+01:00,10.00018,20,XX,,",
				"2020-03-03T10:00:00Z,10,20,XX,,",
			]),
		);
		await user.click(
			await screen.findByRole("button", { name: "Add to them" }),
		);

		await screen.findByText(
			"Added 1 new photo location, 1 was already there. Total 3 from 2 files.",
		);
		expect(await db.locations.count()).toBe(3);
	});

	it("replace keeps only the new file's rows and lists just it", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/locations");
		await importFirst(user);

		await user.upload(
			screen.getByLabelText(PICKER),
			csvFile("new.csv", ["2021-01-01T10:00:00Z,10,20,XX,d.jpg,u9"]),
		);
		await user.click(await screen.findByRole("button", { name: "Replace" }));

		await screen.findByText(/Imported 1 location ·/);
		await waitFor(async () =>
			expect(await uuids(db.locations.toArray())).toEqual(["u9"]),
		);
		const list = await screen.findByRole("list", { name: "Imported files" });
		await waitFor(() =>
			expect(
				within(list)
					.getAllByRole("listitem")
					.map((item) => item.querySelector(".import-file-name")?.textContent),
			).toEqual(["new.csv"]),
		);
	});

	it("words the counts", () => {
		expect(
			addResultText({ added: 1234, duplicates: 56, total: 9876, files: 2 }),
		).toBe(
			"Added 1,234 new photo locations, 56 were already there. Total 9,876 from 2 files.",
		);
		expect(addResultText({ added: 0, duplicates: 1, total: 1, files: 1 })).toBe(
			"Added 0 new photo locations, 1 was already there. Total 1 from 1 file.",
		);
	});
});
