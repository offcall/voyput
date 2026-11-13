import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PassportPhoto } from "@voyput/core";
import { describe, expect, it } from "vitest";
import type { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

// jsdom has no object URLs.
let urlCount = 0;
URL.createObjectURL = () => `blob:test-${++urlCount}`;
URL.revokeObjectURL = () => {};

const file = (name: string, type: string) =>
	new File([new Uint8Array([1, 2, 3])], name, { type });

describe("import passport photos", () => {
	it("adds JPEG/PNG photos, rejects HEIC and keeps the rotation", async () => {
		const user = userEvent.setup({ applyAccept: false });
		const first = renderApp("/collect/passports");

		await user.type(await screen.findByLabelText("Passport name"), "Moldova 1");
		await user.type(screen.getByLabelText("Valid from"), "2014-03-01");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		const picker = await screen.findByLabelText("Add page photos to Moldova 1");

		await user.upload(picker, [
			file("page-1.jpg", "image/jpeg"),
			file("page-2.png", "image/png"),
			file("page-3.heic", "image/heic"),
		]);

		const grid = await screen.findByRole("list", {
			name: "Photos of Moldova 1",
		});
		await waitFor(() =>
			expect(within(grid).getAllByRole("img")).toHaveLength(2),
		);
		expect(screen.getByRole("alert").textContent).toContain("page-3.heic");
		expect(await first.db.photos.count()).toBe(2);

		await user.upload(picker, [file("page-1.jpg", "image/jpeg")]);
		expect((await screen.findByRole("status")).textContent).toContain(
			"Already added: page-1.jpg",
		);
		expect(await first.db.photos.count()).toBe(2);

		const rotate = screen.getByRole("button", { name: "Rotate page-1.jpg" });
		await Promise.all([user.click(rotate), user.click(rotate)]);
		await waitFor(() =>
			expect(
				screen.getByRole("img", { name: "page-1.jpg" }).dataset.rotation,
			).toBe("180"),
		);
		first.unmount();

		renderApp("/collect/passports", { db: first.db });
		const img = await screen.findByRole("img", { name: "page-1.jpg" });
		expect(img.dataset.rotation).toBe("180");
		expect(
			screen.getByRole("img", { name: "page-2.png" }).dataset.rotation,
		).toBe("0");
	});

	it("deletes a photo and then the passport with everything read from them", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/passports");

		await user.type(await screen.findByLabelText("Passport name"), "Old");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		await user.upload(await screen.findByLabelText("Add page photos to Old"), [
			file("page-1.jpg", "image/jpeg"),
			file("page-2.jpg", "image/jpeg"),
		]);
		await screen.findByRole("img", { name: "page-2.jpg" });
		const photos = await db.photos.toArray();
		for (const photo of photos) await seedResults(db, photo);
		const kept = photos.find((photo) => photo.name === "page-2.jpg");

		await user.click(screen.getByRole("button", { name: "Delete page-1.jpg" }));
		await user.click(
			await screen.findByRole("button", { name: "Delete photo" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("img", { name: "page-1.jpg" })).toBeNull(),
		);
		expect((await db.photos.toArray()).map((photo) => photo.id)).toEqual([
			kept?.id,
		]);
		expect((await db.extractions.toArray()).map((row) => row.photoId)).toEqual([
			kept?.id,
		]);
		expect((await db.stamps.toArray()).map((row) => row.photoId)).toEqual([
			kept?.id,
		]);

		await user.click(screen.getByRole("button", { name: "Delete" }));
		await user.click(
			await screen.findByRole("button", { name: "Delete passport" }),
		);
		await waitFor(() =>
			expect(screen.queryByRole("heading", { name: "Old" })).toBeNull(),
		);
		expect(await db.passports.count()).toBe(0);
		expect(await db.photos.count()).toBe(0);
		expect(await db.extractions.count()).toBe(0);
		expect(await db.stamps.count()).toBe(0);
	});
});

/** What Extract would have stored for a photo: its extraction and one stamp. */
async function seedResults(db: VoyputDb, photo: PassportPhoto) {
	await db.extractions.add({
		photoId: photo.id,
		status: "ok",
		notes: "",
		model: "test",
		seconds: 1,
		finishedAt: "2026-01-01T00:00:00Z",
	});
	await db.stamps.add({
		id: `stamp-${photo.id}`,
		passportId: photo.passportId,
		photoId: photo.id,
		direction: "entry",
		borderCrossing: "car",
		dateText: "",
		date: "2016-02-29",
		country: null,
		countryCode: null,
		location: null,
		confidence: 90,
		notes: "",
		problem: null,
		source: "ai",
		reviewed: false,
	});
}
