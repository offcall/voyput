import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VIZ_TABS } from "../src/features/visualize/tabs";
import { renderApp } from "./renderApp";

const area = () => within(screen.getByRole("group", { name: "Area" }));
const nav = () => within(screen.getByRole("navigation", { name: "Sections" }));
const first = VIZ_TABS[0];
const second = VIZ_TABS[1];
const third = VIZ_TABS[2];

describe("collect and visualize navigation", () => {
	if (!first || !second || !third) throw new Error("need three tabs");

	it("switches between the areas and lists each area's pages", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/review");
		await screen.findByRole("tab", { name: "Photos" });
		// One switch inside the section nav, which is the sidebar on desktop and the
		// bottom tab bar on phones (CSS only), so both widths expose it.
		expect(nav().getByRole("group", { name: "Area" })).toBeTruthy();
		expect(
			area()
				.getByRole("link", { name: "Collect" })
				.getAttribute("aria-current"),
		).toBe("page");
		expect(nav().getByRole("link", { name: "Trips" })).toBeTruthy();
		expect(nav().queryByRole("link", { name: second.label })).toBeNull();

		await user.click(area().getByRole("link", { name: "Visualize" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${first.id}`),
		);
		expect(
			area()
				.getByRole("link", { name: "Visualize" })
				.getAttribute("aria-current"),
		).toBe("page");
		expect(nav().queryByRole("link", { name: "Trips" })).toBeNull();
		for (const tab of VIZ_TABS)
			expect(nav().getByRole("link", { name: tab.label })).toBeTruthy();

		// Each switch returns to the page last visited in its area.
		await user.click(nav().getByRole("link", { name: third.label }));
		await user.click(area().getByRole("link", { name: "Collect" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/review"));
		await user.click(area().getByRole("link", { name: "Visualize" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${third.id}`),
		);
	});

	it("redirects /visualize to the first tab without a history entry", async () => {
		const { router } = renderApp("/import");
		await screen.findByRole("heading", { level: 1, name: "Import" });
		await router.navigate({ to: "/visualize" });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe(`/visualize/${first.id}`),
		);
		router.history.back();
		await waitFor(() => expect(router.state.location.pathname).toBe("/import"));
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

	it("reaches Settings from both areas and keeps the last area there", async () => {
		const user = userEvent.setup();
		renderApp(`/visualize/${second.id}`);
		await screen.findByRole("heading", { level: 1, name: "Visualize" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		// Settings belongs to neither area: the Visualize tabs stay listed.
		expect(nav().getByRole("link", { name: second.label })).toBeTruthy();

		await user.click(area().getByRole("link", { name: "Collect" }));
		await screen.findByRole("heading", { level: 1, name: "Import" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		expect(nav().getByRole("link", { name: "Import" })).toBeTruthy();
	});
});
