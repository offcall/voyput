import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { saveSources } from "../src/data/plan/sources";
import { renderApp } from "./renderApp";

describe("Collect steps on a phone", () => {
	it("folds the steps into one button that lists them in a sheet", async () => {
		const user = userEvent.setup();
		const { db, router } = renderApp("/collect/passports");
		await saveSources(db, "both");
		const toggle = await screen.findByRole("button", {
			name: "Steps: 0 of 5 done, now Passports. Show all steps",
		});
		expect(toggle.textContent).toContain("0/5");

		await user.click(toggle);
		const sheet = await screen.findByRole("dialog", { name: "Collect steps" });
		const steps = within(
			within(sheet).getByRole("navigation", { name: "All Collect steps" }),
		);
		expect(steps.getAllByRole("link")).toHaveLength(5);

		await user.click(
			steps.getByRole("link", { name: /^Step 2: Photo locations/ }),
		);
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/locations"),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
