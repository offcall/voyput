import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AiClient } from "../src/ai/openrouter";
import { VoyputDb } from "../src/db/db";
import { offlineAi, renderApp } from "./renderApp";

const stampJson = (stamps: object[]) =>
	JSON.stringify({ notes: `${stamps.length} stamps`, stamps });

const raw = (
	direction: string,
	countryCode: string,
	date: string,
	dateText: string,
) => ({
	direction,
	dateText,
	date,
	country: countryCode,
	countryCode,
	location: null,
	confidence: 90,
});

/** Model answers per photo name; page-3 fails until `pageThreeWorks` is set. */
function stubAi() {
	const state = { pageThreeWorks: false };
	const ai: AiClient = {
		...offlineAi,
		askAboutImage: async (_settings, question) => {
			if (question.text.includes("page-1"))
				return {
					cost: null,
					text: stampJson([
						raw("entry", "UA", "2019-07-01", "▷ 01 07 19 02"),
						raw("exit", "UA", "2019-07-20", "◁ 20 07 19 02"),
					]),
				};
			if (question.text.includes("page-2"))
				return {
					cost: null,
					text: stampJson([
						raw("entry", "MD", "2019-07-10", "10.07.19 5"),
						raw("exit", "MD", "2019-07-12", "12.07.19 5"),
						// Printed 2017 but read as 2018: flagged.
						raw("entry", "MD", "2018-01-03", "03.01.17 5"),
					]),
				};
			if (!state.pageThreeWorks)
				throw new Error("OpenRouter error 502 Bad Gateway");
			return { cost: null, text: stampJson([]) };
		},
	};
	return { ai, state };
}

async function seed(db: VoyputDb) {
	await db.passports.add({
		id: "pp1",
		name: "Moldova 1",
		validFrom: "2016-01-01",
		validTo: "2026-01-01",
		createdAt: "2026-01-01T00:00:00Z",
	});
	await db.photos.bulkAdd(
		["page-1", "page-2", "page-3"].map((name) => ({
			id: name,
			passportId: "pp1",
			name,
			mimeType: "image/jpeg" as const,
			rotation: 0 as const,
			addedAt: "2026-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/jpeg" }),
		})),
	);
}

let dbCount = 0;

describe("extract", () => {
	it("stores stamps, flags problems and conflicts, and retries a failed photo", async () => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
		const db = new VoyputDb(`extract-${++dbCount}`);
		await seed(db);
		const { ai, state } = stubAi();
		const user = userEvent.setup();
		renderApp("/extract", { db, ai });

		const row = (name: string) => screen.getByRole("listitem", { name });
		await screen.findByRole("listitem", { name: "page-3" });
		await user.click(screen.getByRole("button", { name: "Extract" }));
		await waitFor(() =>
			expect(within(row("page-3")).getByText(/502 Bad Gateway/)).toBeTruthy(),
		);
		expect(within(row("page-1")).getByText("ok · 2 stamps")).toBeTruthy();
		expect(within(row("page-2")).getByText("ok · 3 stamps")).toBeTruthy();
		expect(
			within(row("page-2")).getByText(/does not match printed "03.01.17 5"/),
		).toBeTruthy();

		const stamps = await db.stamps.toArray();
		expect(stamps).toHaveLength(5);
		expect(stamps.filter((stamp) => stamp.problem)).toHaveLength(1);
		expect((await db.extractions.get("page-3"))?.status).toBe("failed");

		// Moldova 10–12 July lies inside Ukraine 1–20 July.
		const conflicts = screen.getByRole("list", { name: "Timeline conflicts" });
		const [conflict] = within(conflicts).getAllByRole("listitem");
		expect(conflict?.textContent).toContain("UA 2019-07-01 – 2019-07-20");
		expect(conflict?.textContent).toContain("MD 2019-07-10 – 2019-07-12");

		state.pageThreeWorks = true;
		await user.click(screen.getByRole("button", { name: "Retry failed" }));
		await waitFor(() =>
			expect(within(row("page-3")).getByText("ok · 0 stamps")).toBeTruthy(),
		);
		expect((await db.extractions.get("page-3"))?.status).toBe("ok");
		expect(await db.stamps.count()).toBe(5);
	});

	it("asks for an OpenRouter key before extracting", async () => {
		const user = userEvent.setup();
		renderApp("/extract");
		await user.click(
			await screen.findByRole("link", { name: "Add it in Settings" }),
		);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Settings" }),
		).toBeTruthy();
	});
});
