import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { collectTarget } from "../src/app/Layout";
import { buildPlan } from "../src/data/plan/planProgress";
import { INSIGHT_VIEWS } from "../src/features/visualize/views";
import { renderApp } from "./renderApp";

const nav = () => within(screen.getByRole("navigation", { name: "Sections" }));
const collectLink = () => nav().getByRole("link", { name: /^Collect/ });
const staysLink = () => nav().getByRole("link", { name: /^Stays/ });
const current = (link: HTMLElement) => link.getAttribute("aria-current");

describe("collect, stays and insights navigation", () => {
	it("lists Collect, Stays, Insights and its views, and returns to the last step and view", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/review");
		await screen.findByRole("heading", { level: 2, name: "Review the stamps" });
		for (const old of ["Import", "Extract", "Review", "Trips", "Visualize"])
			expect(nav().queryByRole("link", { name: old })).toBeNull();
		expect(current(collectLink())).toBe("page");
		expect(current(staysLink())).toBeNull();
		for (const view of INSIGHT_VIEWS)
			expect(nav().getByRole("link", { name: view.label })).toBeTruthy();

		// Stays is the Stays step of Collect, with its own nav item.
		await user.click(staysLink());
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/trips"),
		);
		expect(current(staysLink())).toBe("page");
		expect(current(collectLink())).toBeNull();

		// Insights opens the first view, then the last one visited.
		await user.click(nav().getByRole("link", { name: "Insights" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/journey"),
		);
		expect(current(nav().getByRole("link", { name: "Journey" }))).toBe("page");
		await user.click(nav().getByRole("link", { name: "Calendar" }));
		await user.click(collectLink());
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/review"),
		);
		await user.click(nav().getByRole("link", { name: "Insights" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/calendar"),
		);
	});

	it("says the data stays local", async () => {
		renderApp("/collect/passports");
		const note = await screen.findByText("Local only");
		expect(note.parentElement?.getAttribute("title")).toBe(
			"Your data never leaves this browser.",
		);
	});

	it("redirects /visualize to the first view without a history entry", async () => {
		const { router } = renderApp("/collect/passports");
		await screen.findByRole("heading", { level: 1, name: "Collect" });
		await router.navigate({ to: "/visualize" });
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/journey"),
		);
		router.history.back();
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/collect/passports"),
		);
	});

	it.each([
		["/visualize/route", "/insights/journey", {}, ""],
		["/visualize/explore", "/insights/stats", {}, ""],
		["/visualize/map", "/insights/map", { mode: "flat" }, ""],
		[
			"/visualize/heatmap?from=x",
			"/insights/map",
			{ mode: "heat", from: "x" },
			"",
		],
		["/visualize/globe", "/insights/map", { mode: "globe" }, ""],
		["/visualize/calendar", "/insights/calendar", {}, ""],
		["/visualize/movements", "/insights/stats", {}, "periods"],
		["/visualize/countries", "/insights/stats", {}, "countries"],
		["/visualize/matrix", "/insights/stats", {}, "years"],
		["/visualize/donut", "/insights/stats", {}, "years"],
		["/visualize/sankey", "/insights/stats", {}, "moves"],
		["/visualize/distance", "/insights/stats", {}, "distance"],
		["/visualize/nope", "/insights/journey", {}, ""],
		["/insights/nope", "/insights/journey", {}, ""],
	])(
		"redirects %s to the view that holds it",
		async (from, to, search, hash) => {
			const { router } = renderApp(from);
			await waitFor(() => expect(router.state.location.pathname).toBe(to));
			expect(router.state.location.search).toEqual(search);
			expect(router.state.location.hash).toBe(hash);
		},
	);

	it("moves between views with back and forward", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/insights/journey");
		await screen.findByRole("heading", { level: 1, name: "Journey" });
		await user.click(nav().getByRole("link", { name: "Map" }));
		await user.click(nav().getByRole("link", { name: "Stats" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/stats"),
		);

		router.history.back();
		await waitFor(() =>
			expect(current(nav().getByRole("link", { name: "Map" }))).toBe("page"),
		);
		router.history.forward();
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/insights/stats"),
		);
	});

	it("reaches Settings from both areas", async () => {
		const user = userEvent.setup();
		renderApp("/insights/map");
		await screen.findByRole("heading", { level: 1, name: "Map" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		expect(nav().getByRole("link", { name: "Map" })).toBeTruthy();
		expect(current(collectLink())).toBeNull();

		await user.click(collectLink());
		await screen.findByRole("heading", { level: 1, name: "Collect" });
		await user.click(screen.getByRole("link", { name: "Settings" }));
		await screen.findByRole("heading", { level: 1, name: "Settings" });
		expect(current(collectLink())).toBeNull();
	});

	it("never sends Collect to the Stays step", async () => {
		const user = userEvent.setup();
		const { router } = renderApp("/collect/trips");
		await waitFor(() => expect(current(staysLink())).toBe("page"));
		await user.click(nav().getByRole("link", { name: "Insights" }));
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(/^\/insights\//),
		);
		await user.click(collectLink());
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(/^\/collect\/[a-z]+$/),
		);
		expect(router.state.location.pathname).not.toBe("/collect/trips");
	});

	it("picks a source step for Collect: remembered, first unfinished, or the last one", () => {
		const done = buildPlan({
			passports: 1,
			photos: 1,
			locations: 1,
			locationCountries: ["RO"],
			extracted: 1,
			failed: 0,
			stamps: 1,
			toReview: 0,
			problems: 0,
			stays: [],
			birthCountry: null,
		});
		expect(done.next?.id).toBe("trips");
		expect(collectTarget("review", done)).toBe("review");
		expect(collectTarget("trips", done)).toBe("review");
		expect(collectTarget(null, done)).toBe("review");
		expect(collectTarget(null, undefined)).toBe("passports");
		const empty = buildPlan({ ...done.input, passports: 0, photos: 0 });
		expect(collectTarget(null, empty)).toBe("passports");
	});
});
