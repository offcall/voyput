import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SECTIONS } from "../src/app/Layout";
import { renderApp } from "./renderApp";

describe("app shell", () => {
	it("opens on Import and reaches every section from the nav", async () => {
		const user = userEvent.setup();
		renderApp("/");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Import" }),
		).toBeTruthy();

		for (const section of SECTIONS) {
			await user.click(screen.getByRole("link", { name: section.label }));
			expect(
				await screen.findByRole("heading", { level: 1, name: section.label }),
			).toBeTruthy();
		}
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
