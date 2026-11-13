import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubDemoFetch, stubObjectUrls } from "./fixtures/demo";
import { renderApp } from "./renderApp";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const DEMO_NOTICE =
	"Demo photo locations loaded: 2,467 locations · 6 countries · 2016–2019.";

describe("location card after a demo load", () => {
	it("drops the demo notice once demo data is removed", async () => {
		stubDemoFetch();
		stubObjectUrls();
		const user = userEvent.setup();
		renderApp("/collect/passports");
		const step = (name: RegExp) => screen.getByRole("link", { name });

		await user.click(
			await screen.findByRole("button", { name: "Load demo data" }),
		);
		await screen.findByText(/Loaded 5 demo pages/);
		// The demo card is on the passports step; the locations step reports the load.
		await user.click(step(/^Step 2: Photo locations/));
		await screen.findByText(DEMO_NOTICE);

		await user.click(step(/^Step 1: Passports/));
		await user.click(
			await screen.findByRole("button", { name: "Remove demo data" }),
		);
		await user.click(await screen.findByRole("button", { name: "Remove" }));
		await screen.findByText("Demo data removed.");
		await user.click(step(/^Step 2: Photo locations/));
		await screen.findByRole("region", { name: "Stored photo locations" });
		await waitFor(() => expect(screen.queryByText(DEMO_NOTICE)).toBeNull());
	});
});
