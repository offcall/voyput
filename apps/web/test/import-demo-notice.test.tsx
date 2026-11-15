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
	"Demo photo locations loaded: 5,373 locations · 17 countries · 2016–2025.";

describe("location card after a demo load", () => {
	it("drops the demo notice once demo data is removed", async () => {
		stubDemoFetch();
		stubObjectUrls();
		const user = userEvent.setup();
		renderApp("/collect/passports");
		const step = (name: RegExp) => screen.getByRole("link", { name });

		await user.click(
			await screen.findByRole("button", { name: /^Sources: .* · change$/ }),
		);
		await user.click(
			await screen.findByRole("button", { name: "Try with demo data" }),
		);
		await screen.findByText(/10 demo pages/);
		// The demo banner is on the passports step; the locations step reports the load.
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
