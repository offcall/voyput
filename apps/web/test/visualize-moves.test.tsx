import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type LocationRow,
	type Move,
	type Movement,
	moveRoutes,
} from "@voyput/core";
import { describe, expect, it } from "vitest";
import { VoyputDb } from "../src/db/db";
import { layoutSankey, OTHER } from "../src/features/visualize/charts/moves";
import { renderApp } from "./renderApp";

let n = 0;
const photo = (
	day: string,
	countryCode: string,
	country: string,
): LocationRow => ({
	date: `${day}T12:00:00+02:00`,
	lat: 45,
	lon: 27,
	countryCode,
	country,
	city: "",
	source: "apple",
	isVideo: false,
	filename: `IMG_${++n}.jpg`,
	uuid: `moves-${n}`,
});

const stay = (code: string, start: string): Movement => ({
	code,
	country: code,
	start,
	end: start,
	photos: 1,
	range: 0,
});
const move = (from: string, to: string, day: string): Move => ({
	from: stay(from, day),
	to: stay(to, day),
});

describe("moves sankey layout", () => {
	it("merges countries beyond the top into Other", () => {
		const many = ["AA", "BB", "CC", "DD"].map((to, i) =>
			move("MD", to, `2024-01-0${i + 1}`),
		);
		const layout = layoutSankey(moveRoutes(many, null), 600, 3);
		expect(layout.nodes.map((node) => `${node.side}:${node.code}`)).toEqual([
			"from:MD",
			"to:AA",
			"to:BB",
			"to:OTHER",
		]);
		expect(layout.links.find((l) => l.to === OTHER)?.count).toBe(2);
		// Labels never overlap, however thin a node.
		const right = layout.nodes.filter((node) => node.side === "to");
		for (let i = 1; i < right.length; i++) {
			const above = right[i - 1];
			const node = right[i];
			if (above && node) expect(node.y - above.y).toBeGreaterThanOrEqual(10);
		}
	});
});

describe("moves on Stats", () => {
	it("filters moves by year and lists routes in a table", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("visualize-moves");
		await db.locations.bulkPut([
			photo("2023-12-30", "MD", "Moldova"),
			photo("2023-12-31", "RO", "Romania"),
			photo("2024-01-02", "MD", "Moldova"),
			photo("2024-01-03", "RO", "Romania"),
			photo("2024-01-04", "BG", "Bulgaria"),
		]);
		renderApp("/insights/stats", { db });
		const value = (label: string) =>
			screen.getByText(label, { selector: ".vp-moves-stats dt" })
				.nextElementSibling?.textContent;
		await waitFor(() => expect(value("Moves")).toBe("4"));
		expect(value("Routes")).toBe("3");
		expect(value("Busiest")).toBe("MD → RO ×2");

		const flows = screen.getByRole("group", {
			name: "Moves between countries",
		});
		expect(
			within(flows).getByRole("img", { name: "Moldova → Romania: 2 moves" }),
		).toBeTruthy();

		const years = screen.getByRole("group", { name: "Year" });
		await user.click(within(years).getByRole("button", { name: "2023" }));
		expect(value("Moves")).toBe("1");
		expect(
			within(years)
				.getByRole("button", { name: "2023" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		await user.click(within(years).getByRole("button", { name: "All" }));
		await user.click(screen.getByRole("tab", { name: "Table" }));
		const rows = within(
			screen.getByRole("table", { name: /a move is a day/ }),
		).getAllByRole("row");
		expect(rows.map((row) => row.textContent)).toEqual([
			"FromToMovesLast",
			expect.stringMatching(/MD.*Moldova.*RO.*Romania.*2.*2024-01-03/),
			expect.stringMatching(/RO.*Romania.*BG.*Bulgaria.*1.*2024-01-04/),
			expect.stringMatching(/RO.*Romania.*MD.*Moldova.*1.*2024-01-02/),
		]);
	});

	it("highlights a country's or a route's moves on hover and focus", async () => {
		const user = userEvent.setup();
		const db = new VoyputDb("visualize-moves-highlight");
		await db.locations.bulkPut([
			photo("2024-01-01", "MD", "Moldova"),
			photo("2024-01-02", "RO", "Romania"),
			photo("2024-01-03", "MD", "Moldova"),
			photo("2024-01-04", "RO", "Romania"),
			photo("2024-01-05", "BG", "Bulgaria"),
		]);
		renderApp("/insights/stats", { db });
		const flows = await screen.findByRole("group", {
			name: "Moves between countries",
		});
		const band = (name: string) =>
			within(flows).getByRole("img", { name: new RegExp(`^${name}:`) });
		const lit = () =>
			[...flows.querySelectorAll(".vp-moves-band[data-lit]")]
				.map((el) => el.getAttribute("aria-label")?.split(":")[0])
				.sort();
		const bands = [
			"Moldova → Romania",
			"Romania → Bulgaria",
			"Romania → Moldova",
		];
		await waitFor(() => expect(lit()).toEqual(bands));
		expect(flows.hasAttribute("data-active")).toBe(false);

		await user.hover(band("Romania → Bulgaria"));
		expect(flows.hasAttribute("data-active")).toBe(true);
		expect(lit()).toEqual(["Romania → Bulgaria"]);
		await user.unhover(band("Romania → Bulgaria"));
		expect(flows.hasAttribute("data-active")).toBe(false);

		await user.hover(within(flows).getByRole("img", { name: /^To Moldova:/ }));
		expect(lit()).toEqual(["Moldova → Romania", "Romania → Moldova"]);
		expect(screen.getByText(/^Moldova: 2 out, 1 in\./)).toBeTruthy();
		await user.unhover(
			within(flows).getByRole("img", { name: /^To Moldova:/ }),
		);

		const bulgaria = within(flows).getByRole("img", { name: /^To Bulgaria:/ });
		bulgaria.focus();
		await waitFor(() => expect(lit()).toEqual(["Romania → Bulgaria"]));
		bulgaria.blur();
		await waitFor(() => expect(lit()).toEqual(bands));
	});
});
