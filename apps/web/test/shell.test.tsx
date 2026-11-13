import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

/** 2,500 location rows (UA most, then IT) and one photo without an extraction. */
async function seedCounts(db: VoyputDb) {
	await db.locations.bulkAdd(
		Array.from({ length: 2500 }, (_, i) => ({
			date: "2020-01-01T00:00:00",
			lat: 0,
			lon: 0,
			countryCode: i < 2000 ? "UA" : "IT",
			country: "",
			city: "",
			source: "",
			isVideo: false,
			filename: `${i}.jpg`,
			uuid: `u${i}`,
		})),
	);
	await db.photos.add({
		id: "p1",
		passportId: "pp1",
		name: "p1",
		mimeType: "image/jpeg",
		rotation: 0,
		addedAt: "2026-01-01T00:00:00Z",
		blob: new Blob(["x"], { type: "image/jpeg" }),
	});
}

describe("app shell", () => {
	it("opens on the first Collect step and reaches Visualize and Settings from the nav", async () => {
		const user = userEvent.setup();
		renderApp("/");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Collect" }),
		).toBeTruthy();
		expect(
			screen.getByRole("heading", { level: 2, name: "Passports" }),
		).toBeTruthy();

		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		await user.click(screen.getByRole("link", { name: "Route" }));
		await screen.findByRole("heading", { level: 1, name: "Visualize" });
		await user.click(screen.getByRole("link", { name: /^Collect/ }));
		await screen.findByRole("heading", { level: 1, name: "Collect" });
	});

	it("shows Collect progress on the nav item", async () => {
		const { db } = renderApp("/settings");
		await seedCounts(db);
		// A photo and locations: the first two of five steps are done.
		await waitFor(() =>
			expect(screen.getByRole("link", { name: /^Collect/ }).textContent).toBe(
				"Collect2/5",
			),
		);
	});

	it("gives countries distinct palette colours from the stored data", async () => {
		const { db } = renderApp("/collect/locations");
		await seedCounts(db);
		const stored = await screen.findByRole("region", {
			name: "Stored locations",
		});
		const colours = () =>
			Object.fromEntries(
				[...stored.querySelectorAll<HTMLElement>(".vp-country")].map((chip) => [
					chip.querySelector(".vp-country-code")?.textContent,
					chip.style.getPropertyValue("--vp-country-colour"),
				]),
			);
		await waitFor(() =>
			expect(colours()).toEqual({
				UA: "var(--vp-cat-1)",
				IT: "var(--vp-cat-2)",
			}),
		);
	});

	it("starts dark, switches the theme and remembers it", async () => {
		const user = userEvent.setup();
		const first = renderApp("/import");
		const dark = await screen.findByRole("button", { name: "Dark theme" });
		expect(dark.getAttribute("aria-pressed")).toBe("true");
		await user.click(screen.getByRole("button", { name: "Light theme" }));
		expect(document.documentElement.dataset.theme).toBe("light");
		first.unmount();

		const second = renderApp("/import");
		const light = await screen.findByRole("button", { name: "Light theme" });
		expect(light.getAttribute("aria-pressed")).toBe("true");
		await user.click(screen.getByRole("button", { name: "System theme" }));
		expect(document.documentElement.dataset.theme).toBe("system");
		expect(localStorage.getItem("voyput:theme")).toBe("system");
		second.unmount();

		renderApp("/import");
		const system = await screen.findByRole("button", { name: "System theme" });
		expect(system.getAttribute("aria-pressed")).toBe("true");
	});

	it("keeps the OpenRouter key and model after a reload", async () => {
		const user = userEvent.setup();
		const first = renderApp("/settings");
		await user.type(await screen.findByLabelText("API key"), "sk-or-test");
		const model = screen.getByLabelText("Model");
		await user.clear(model);
		await user.type(model, "openai/gpt-6.1-sol");
		first.unmount();

		renderApp("/settings");
		expect(
			((await screen.findByLabelText("API key")) as HTMLInputElement).value,
		).toBe("sk-or-test");
		expect((screen.getByLabelText("Model") as HTMLInputElement).value).toBe(
			"openai/gpt-6.1-sol",
		);
	});

	it("keeps working when the browser refuses to store settings", async () => {
		const user = userEvent.setup();
		const setItem = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("QuotaExceededError");
			});
		renderApp("/settings");
		await user.type(await screen.findByLabelText("API key"), "sk-or-x");
		expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(
			"sk-or-x",
		);
		expect(screen.getByRole("alert").textContent).toMatch(/refused to save/);
		setItem.mockRestore();
	});
});
