import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoyputDb } from "../src/db/db";
import { renderApp } from "./renderApp";

describe("the Collect plan", () => {
	it("is computed once by the shell for the nav and the Collect page", async () => {
		const db = new VoyputDb("collect-plan-shared");
		await db.kv.put({ key: "collect:sources", value: "both" });
		const counted = vi.spyOn(db.passports, "count");
		renderApp("/collect/passports", { db });
		await screen.findByRole("heading", { name: /passport/i });
		await waitFor(() => expect(counted).toHaveBeenCalled());
		expect(counted).toHaveBeenCalledTimes(1);
	});
});
