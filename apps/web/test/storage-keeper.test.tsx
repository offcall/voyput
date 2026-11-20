import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	browserStorageKeeper,
	keepStorageOnce,
	type StorageKeeper,
} from "../src/data/storageKeeper";
import { VoyputDb } from "../src/db/db";
import { addPhotos } from "../src/features/import/photos/passportStore";
import { renderApp } from "./renderApp";

/** A fake StorageManager on navigator; jsdom has none. */
function fakeStorage(initial: boolean, grant: boolean) {
	let kept = initial;
	const storage = {
		persisted: vi.fn(async () => kept),
		persist: vi.fn(async () => {
			kept = grant;
			return grant;
		}),
	};
	Object.defineProperty(navigator, "storage", {
		configurable: true,
		value: storage,
	});
	return storage;
}

afterEach(() => {
	Reflect.deleteProperty(navigator, "storage");
	localStorage.clear();
});

const fakeKeeper = (kept: boolean | null): StorageKeeper => ({
	persisted: vi.fn(async () => kept),
	persist: vi.fn(async () => true),
});

describe("storage keeper", () => {
	it("reports null and never throws without the browser API", async () => {
		expect(await browserStorageKeeper.persisted()).toBeNull();
		expect(await browserStorageKeeper.persist()).toBeNull();
		Object.defineProperty(navigator, "storage", {
			configurable: true,
			value: {
				persisted: () => Promise.reject(new Error("blocked")),
				persist: () => {
					throw new Error("blocked");
				},
			},
		});
		expect(await browserStorageKeeper.persisted()).toBeNull();
		expect(await browserStorageKeeper.persist()).toBeNull();
	});

	it("asks the browser once, and not when the data is already kept", async () => {
		const keeper = fakeKeeper(false);
		await keepStorageOnce(keeper);
		await keepStorageOnce(keeper);
		expect(keeper.persist).toHaveBeenCalledOnce();

		localStorage.clear();
		const kept = fakeKeeper(true);
		await keepStorageOnce(kept);
		expect(kept.persist).not.toHaveBeenCalled();
	});

	it("asks after the first passport photo is stored", async () => {
		const storage = fakeStorage(false, true);
		const db = new VoyputDb("storage-keeper-photos");
		await addPhotos(db, "p1", []);
		expect(storage.persist).not.toHaveBeenCalled();
		await addPhotos(db, "p1", [
			new File(["x"], "page.jpg", { type: "image/jpeg" }),
		]);
		await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce());
	});

	it("asks after a location file is imported", async () => {
		const storage = fakeStorage(false, true);
		renderApp("/collect/locations");
		await userEvent.upload(
			await screen.findByLabelText("Drop photo_locations.csv here or pick it"),
			new File(
				[
					"date,lat,lon,country_code,country,city,source,is_video,filename,uuid\n2019-05-01T10:00:00,1,1,ZZ,Testland,Test,apple,False,a.jpg,u1",
				],
				"photo_locations.csv",
				{ type: "text/csv" },
			),
		);
		await screen.findByText(/Imported 1 location/);
		await waitFor(() => expect(storage.persist).toHaveBeenCalledOnce());
	});
});

const card = async () =>
	within(
		(await screen.findByRole("heading", { name: "Your data" })).closest(
			"section",
		) as HTMLElement,
	);

describe("Settings > Your data > storage", () => {
	it("says the browser keeps the data", async () => {
		fakeStorage(true, true);
		renderApp("/settings");
		const data = await card();
		await data.findByText("Storage: kept by the browser ✓");
		expect(
			data.queryByRole("button", { name: "Ask the browser to keep it" }),
		).toBeNull();
	});

	it("asks the browser to keep the data from the button", async () => {
		const storage = fakeStorage(false, true);
		renderApp("/settings");
		const data = await card();
		await data.findByText(/the browser may clear it when space runs low/);
		await userEvent.click(
			data.getByRole("button", { name: "Ask the browser to keep it" }),
		);
		await data.findByText("Storage: kept by the browser ✓");
		expect(storage.persist).toHaveBeenCalledOnce();
	});

	it("says so when the browser does not agree", async () => {
		fakeStorage(false, false);
		renderApp("/settings");
		const data = await card();
		await userEvent.click(
			await data.findByRole("button", { name: "Ask the browser to keep it" }),
		);
		await data.findByText(/The browser did not agree to keep it/);
	});

	it("shows no storage line when the browser cannot tell", async () => {
		renderApp("/settings");
		const data = await card();
		await data.findByText(/This browser holds/);
		expect(data.queryByText(/Storage:/)).toBeNull();
	});
});
