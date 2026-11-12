import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
		const first = renderApp("/");

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

		await user.click(screen.getByRole("button", { name: "Rotate page-1.jpg" }));
		await waitFor(() =>
			expect(
				screen.getByRole("img", { name: "page-1.jpg" }).dataset.rotation,
			).toBe("90"),
		);
		first.unmount();

		renderApp("/", { db: first.db });
		const img = await screen.findByRole("img", { name: "page-1.jpg" });
		expect(img.dataset.rotation).toBe("90");
		expect(
			screen.getByRole("img", { name: "page-2.png" }).dataset.rotation,
		).toBe("0");
	});

	it("deletes a passport with its photos after confirmation", async () => {
		const user = userEvent.setup();
		const { db } = renderApp("/");

		await user.type(await screen.findByLabelText("Passport name"), "Old");
		await user.click(screen.getByRole("button", { name: "Add passport" }));
		await user.upload(await screen.findByLabelText("Add page photos to Old"), [
			file("page-1.jpg", "image/jpeg"),
		]);
		await screen.findByRole("img", { name: "page-1.jpg" });

		await user.click(screen.getByRole("button", { name: "Delete" }));
		await user.click(
			await screen.findByRole("button", { name: "Delete passport" }),
		);

		await waitFor(() =>
			expect(screen.queryByRole("heading", { name: "Old" })).toBeNull(),
		);
		expect(await db.passports.count()).toBe(0);
		expect(await db.photos.count()).toBe(0);
	});
});
