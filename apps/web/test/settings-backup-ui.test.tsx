import { Blob as NodeBlob } from "node:buffer";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Stamp } from "@voyput/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { exportBackup } from "../src/settings/backup";
import { DEFAULT_SETTINGS } from "../src/settings/settings";
import { renderApp } from "./renderApp";

// Synthetic data only. Node's Blob keeps its bytes through fake-indexeddb.
beforeAll(() => {
	vi.stubGlobal("Blob", NodeBlob);
	URL.createObjectURL = () => "blob:test-backup";
	URL.revokeObjectURL = () => {};
});
afterAll(() => {
	vi.unstubAllGlobals();
});

const stamp = (id: string): Stamp => ({
	id,
	passportId: "p1",
	photoId: "ph1",
	direction: "entry",
	borderCrossing: "car",
	dateText: "01.02.22",
	date: "2022-02-01",
	country: "Testland",
	countryCode: "ZZ",
	location: null,
	confidence: 90,
	notes: "",
	problem: null,
	source: "ai",
	reviewed: true,
});

let n = 0;
async function dbWithStamps(ids: string[]): Promise<VoyputDb> {
	const db = new VoyputDb(`backup-ui-${++n}`);
	await db.passports.put({
		id: "p1",
		name: "Test",
		validFrom: null,
		validTo: null,
		createdAt: "2026-01-01T00:00:00Z",
	});
	await db.stamps.bulkPut(ids.map(stamp));
	await db.kv.put({ key: "trips:birth", value: "1991-01-01" });
	return db;
}

async function backupFile(ids: string[]): Promise<File> {
	const source = await dbWithStamps(ids);
	// Without photos: the stamps' page is not in this database either.
	const blob = await exportBackup(source, {
		includePhotos: false,
		settings: { ...DEFAULT_SETTINGS, locationWindowDays: 21 },
		now: new Date("2026-02-03T00:00:00Z"),
	});
	return new File([await blob.text()], "voyput-backup.json", {
		type: "application/json",
	});
}

const card = async () =>
	(await screen.findByRole("heading", { name: "Your data" })).closest(
		"section",
	) as HTMLElement;

describe("Settings > Your data", () => {
	it("exports with photos by default and remembers the date", async () => {
		const db = await dbWithStamps(["s1"]);
		const clicks = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		renderApp("/settings", { db });
		const data = within(await card());
		expect(
			(
				data.getByRole("checkbox", {
					name: "Include passport photos",
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		await data.findByText(
			/This browser holds 1 passport, 0 page photos, 1 stamp/,
		);
		await userEvent.click(data.getByRole("button", { name: "Export" }));
		expect((await data.findByRole("status")).textContent).toMatch(
			/Saved voyput-backup-\d{4}-\d{2}-\d{2}\.json/,
		);
		expect(clicks).toHaveBeenCalledOnce();
		data.getByText(/Last export here:/);
		clicks.mockRestore();
	});

	it("keeps the data when the import is cancelled", async () => {
		const db = await dbWithStamps(["old1", "old2"]);
		renderApp("/settings", { db });
		const data = within(await card());
		await userEvent.upload(
			data.getByLabelText("Backup file"),
			await backupFile(["new1"]),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toMatch(/Deleted from this browser:.*2 stamps/);
		expect(dialog.textContent).toMatch(
			/From the backup of 3 Feb 2026:.*1 stamp/,
		);
		await userEvent.click(
			within(dialog).getByRole("button", { name: "Cancel" }),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect((await db.stamps.toArray()).map((s) => s.id).sort()).toEqual([
			"old1",
			"old2",
		]);
	});

	it("replaces everything after the confirm, and the page follows", async () => {
		const db = await dbWithStamps(["old1", "old2"]);
		renderApp("/settings", { db });
		const data = within(await card());
		await data.findByText(/2 stamps/);
		await userEvent.upload(
			data.getByLabelText("Backup file"),
			await backupFile(["new1"]),
		);
		await userEvent.click(
			await screen.findByRole("button", { name: "Replace everything" }),
		);
		expect((await data.findByRole("status")).textContent).toMatch(
			/Imported the backup of 3 Feb 2026/,
		);
		expect((await db.stamps.toArray()).map((s) => s.id)).toEqual(["new1"]);
		await data.findByText(
			/This browser holds 1 passport, 0 page photos, 1 stamp,/,
		);
		expect(
			(screen.getByLabelText(/Photo location window/) as HTMLInputElement)
				.value,
		).toBe("21");
	});

	it("rejects a file that is not a backup and changes nothing", async () => {
		const db = await dbWithStamps(["old1"]);
		renderApp("/settings", { db });
		const data = within(await card());
		await userEvent.upload(
			data.getByLabelText("Backup file"),
			new File(['{"hello":1}'], "other.json", { type: "application/json" }),
		);
		expect((await data.findByRole("alert")).textContent).toMatch(
			/This is not a voyput backup file\./,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(await db.stamps.count()).toBe(1);
	});
});
