import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VIZ_TABS } from "../src/features/visualize/tabs";
import { renderApp } from "./renderApp";

const nav = () => within(screen.getByRole("navigation", { name: "Sections" }));
const collectLink = () => nav().getByRole("link", { name: /^Collect/ });
const first = VIZ_TABS[0];
const second = VIZ_TABS[1];
const third = VIZ_TABS[2];

describe("collect and visualize navigation", () => {
	if (!first || !second || !third) throw new Error("need three tabs");

	it("has one Collect item beside the Visualize tabs and returns to the last step", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/review");
		await screen.findByRole("heading", { level: 2, name: "Review the stamps" });
		expect(nav().getAllByRole("link", { name: /^Collect/ })).toHaveLength(1);
		for (const old of ["Import", "Extract", "Review", "Trips"])
			expect(nav().queryByRole("link", { name: old })).toBeNull();
		expect(collectLink().getAttribute("aria-current")).toBe("page");
		for (const tab of VIZ_TABS)
			expect(nav().getByRole("link", { name: tab.label })).toBeTruthy();

		// On phones the Collect bar adds one link to Visualize, to the last tab.
		await user.click(nav().getByRole("link", { name: "Visualize" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${first.id}`),
		);
		expect(collectLink().getAttribute("aria-current")).toBeNull();
		expect(nav().queryByRole("link", { name: "Visualize" })).toBeNull();

		await user.click(nav().getByRole("link", { name: third.label }));
		await user.click(collectLink());
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
		await user.click(nav().getByRole("link", { name: "Visualize" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${third.id}`),
		);
	});

	it("redirects /visualize to the first tab without a history entry", async () => {
		const { router } = renderApp("/collect/passports");
		await screen.findByRole("heading", { level: 1, name: "Collect" });
		await router.navigate({ to: "/visualize" });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${first.id}`),
		);
		router.history.back();
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/passports"),
		);
	});

	it("redirects an unknown tab to the first tab", async () => {
		const { router } = renderApp("/visualize/nope");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${first.id}`),
		);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Visualize" }),
		).toBeTruthy();
	});

	it("moves between tabs with back and forward", async () => {
		const user = userEvent.setup();
		const { router } = renderApp(`/visualize/${first.id}`);
		await screen.findByRole("heading", { level: 1, name: "Visualize" });
		await user.click(nav().getByRole("link", { name: second.label }));
		await user.click(nav().getByRole("link", { name: third.label }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${third.id}`),
		);

		router.history.back();
		await waitFor(() =>
			expect(
				nav()
					.getByRole("link", { name: second.label })
					.getAttribute("aria-current"),
			).toBe("page"),
		);
		router.history.forward();
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${third.id}`),
		);
	});

	it("reaches Settings from both areas", async () => {
		const user = userEvent.setup();
		renderApp(`/visualize/${second.id}`);
		await screen.findByRole("heading", { level: 1, name: "Visualize" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		// Settings belongs to neither area: the Visualize tabs stay listed.
		expect(nav().getByRole("link", { name: second.label })).toBeTruthy();

		expect(collectLink().getAttribute("aria-current")).toBeNull();

		await user.click(collectLink());
		await screen.findByRole("heading", { level: 1, name: "Collect" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		expect(collectLink().getAttribute("aria-current")).toBeNull();
	});
});
