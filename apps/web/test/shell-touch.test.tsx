import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "./renderApp";

/** Pretend the screen is a phone: every `max-width` query matches. */
beforeEach(() => {
	window.matchMedia = (query: string) =>
		({
			matches: query.includes("max-width"),
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		}) as unknown as MediaQueryList;
});
afterEach(() => {
	// jsdom has no matchMedia; put it back the way it was.
	Reflect.deleteProperty(window, "matchMedia");
});

const tabs = () => within(screen.getByRole("navigation", { name: "Sections" }));

describe("app shell on phones and tablets", () => {
	it("has a bottom bar with Collect (and its progress), Stays, Insights and Settings", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/settings");
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		const names = tabs()
			.getAllByRole("link")
			.map((link) => link.textContent);
		expect(names).toEqual([
			expect.stringMatching(/^Collect/),
			"Stays",
			"Insights",
			"Settings",
		]);
		await waitFor(() =>
			expect(
				tabs().getByRole("link", { name: /^Collect/ }).textContent,
			).toMatch(/0\/5Collect, 0 of 5 steps done/),
		);
		expect(
			tabs()
				.getByRole("link", { name: "Settings" })
				.getAttribute("aria-current"),
		).toBe("page");
		// The views are not in the bar.
		expect(tabs().queryByRole("link", { name: "Journey" })).toBeNull();

		await user.click(tabs().getByRole("link", { name: "Insights" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/journey"),
		);
		expect(
			tabs()
				.getByRole("link", { name: "Insights" })
				.getAttribute("aria-current"),
		).toBe("page");
	});

	it("switches Insights views from a row at the top of the page", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/insights/journey");
		const views = within(
			await screen.findByRole("navigation", { name: "Insights views" }),
		);
		expect(views.getAllByRole("link").map((l) => l.textContent)).toEqual([
			"Journey",
			"Map",
			"Calendar",
			"Stats",
		]);
		await user.click(views.getByRole("link", { name: "Stats" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/stats"),
		);
		expect(
			views.getByRole("link", { name: "Stats" }).getAttribute("aria-current"),
		).toBe("page");
	});

	it("shows no views row outside Insights", async () => {
		renderApp("/settings");
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		expect(
			screen.queryByRole("navigation", { name: "Insights views" }),
		).toBeNull();
	});
});
