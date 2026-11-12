import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
