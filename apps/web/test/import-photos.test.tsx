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
	it("says to connect an AI in Settings until one is set up", async () => {
		const first = renderApp("/collect/passports");
		const callout = (
			await screen.findByText(
				"Next: connect an AI to read the stamps. Your photos are saved.",
			)
		).closest(".vp-notice") as HTMLElement;
		expect(callout.dataset.tone).toBe("warn");
		expect(
			within(callout)
				.getByRole("link", { name: "Add it in Settings" })
				.getAttribute("href"),
		).toBe("/settings");
		first.unmount();

		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
		try {
			renderApp("/collect/passports");
			await screen.findByLabelText("Passport name");
			expect(screen.queryByText(/Next: connect an AI/)).toBeNull();
		} finally {
			localStorage.removeItem("voyput:settings");
		}
	});

	it("adds JPEG/PNG photos, rejects other files and keeps the rotation", async () => {
		const user = userEvent.setup({ applyAccept: false });
		const first = renderApp("/collect/passports");

		await user.type(await screen.findByLabelText("Passport name"), "Moldova 1");
		await user.click(screen.getByText("Validity dates (optional)"));
		await user.type(screen.getByLabelText("Valid from"), "2014-03-01");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		const picker = await screen.findByLabelText("Add page photos to Moldova 1");

		await user.upload(picker, [
			file("page-1.jpg", "image/jpeg"),
			file("page-2.png", "image/png"),
			file("page-3.webp", "image/webp"),
		]);

		const grid = await screen.findByRole("list", {
			name: "Photos of Moldova 1",
		});
		await waitFor(() =>
			expect(within(grid).getAllByRole("img")).toHaveLength(2),
		);
		expect(screen.getByRole("alert").textContent).toContain("page-3.webp");
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

	it("opens a photo in Review from its card, but not from its buttons", async () => {
		const user = userEvent.setup();
		const { db, router } = renderApp("/collect/passports");

		await user.type(await screen.findByLabelText("Passport name"), "Trip");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		await user.upload(await screen.findByLabelText("Add page photos to Trip"), [
			file("page-1.jpg", "image/jpeg"),
		]);
		const open = await screen.findByRole("link", {
			name: "Open page-1.jpg in Review",
		});
		const [photo] = await db.photos.toArray();

		await user.click(screen.getByRole("button", { name: "Rotate page-1.jpg" }));
		await user.click(screen.getByRole("button", { name: "Delete page-1.jpg" }));
		await user.click(await screen.findByRole("button", { name: "Cancel" }));
		await user.click(screen.getByRole("button", { name: "More for Trip" }));
		await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
		await user.click(await screen.findByRole("button", { name: "Save" }));
		expect(router.state.location.pathname).toBe("/collect/passports");

		open.focus();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
		expect(router.state.location.search).toEqual({ photo: photo?.id });
	});

	it("keeps validity dates behind a disclosure that Edit opens when set", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/collect/passports");

		const name = await screen.findByLabelText("Passport name");
		expect(
			screen.getByText("Helps flag misread stamp years.").closest("details")
				?.open,
		).toBe(false);
		await user.type(name, "Dated");
		await user.click(screen.getByText("Validity dates (optional)"));
		await user.type(screen.getByLabelText("Valid to"), "2030-01-01");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		await screen.findByText(/valid \? – 2030-01-01/);
		expect((await db.passports.toArray())[0]?.validTo).toBe("2030-01-01");

		await user.click(screen.getByRole("button", { name: "More for Dated" }));
		await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
		const dialog = await screen.findByRole("dialog");
		expect(
			within(dialog).getByText("Validity dates (optional)").closest("details")
				?.open,
		).toBe(true);
		expect(
			within(dialog).getByLabelText<HTMLInputElement>("Valid to").value,
		).toBe("2030-01-01");
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

		await user.click(screen.getByRole("button", { name: "More for Old" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
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
