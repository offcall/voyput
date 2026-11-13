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
	"Demo locations loaded: 2,467 locations · 6 countries · 2016–2019.";

describe("location card after a demo load", () => {
	it("drops the demo notice once demo data is removed", {
		timeout: 60000,
	}, async () => {
		stubDemoFetch();
		stubObjectUrls();
		const user = userEvent.setup();
		renderApp("/import");

		await user.click(
			await screen.findByRole("button", { name: "Load demo data" }),
		);
		await screen.findByText(DEMO_NOTICE, undefined, { timeout: 15000 });

		await user.click(screen.getByRole("button", { name: "Remove demo data" }));
		await user.click(await screen.findByRole("button", { name: "Remove" }));
		await screen.findByText("Demo data removed.", undefined, {
			timeout: 15000,
		});
		await waitFor(() => expect(screen.queryByText(DEMO_NOTICE)).toBeNull());
	});
});
