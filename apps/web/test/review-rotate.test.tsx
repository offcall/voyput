import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Rotation } from "@voyput/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "../src/ai/openrouter";
import { VoyputDb } from "../src/db/db";
import { stubObjectUrls } from "./fixtures/demo";
import { offlineAi, renderApp } from "./renderApp";

describe("rotate a page on Review", () => {
	beforeEach(() => stubObjectUrls());

	it("remembers the turn per photo and rescans the turned image, keeping the stored file", async () => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-test" }),
		);
		const db = new VoyputDb("review-rotate");
		await db.passports.put({
			id: "p1",
			name: "Blue",
			validFrom: null,
			validTo: null,
			createdAt: "2024-01-01T00:00:00Z",
		});
		const blob = new Blob(["x"], { type: "image/png" });
		for (const name of ["page-1.png", "page-2.png"])
			await db.photos.put({
				id: name,
				passportId: "p1",
				name,
				mimeType: "image/png",
				rotation: 0,
				addedAt: "2024-01-01T00:00:00Z",
				blob,
			});
		const sent: { blob: Blob; rotation: Rotation }[] = [];
		const ai: AiClient = {
			...offlineAi,
			askAboutImage: async (_settings, question) => {
				sent.push(question.image);
				return { cost: null, text: JSON.stringify({ notes: "", stamps: [] }) };
			},
		};
		const user = userEvent.setup();
		renderApp("/collect/review?photo=page-1.png&tab=photos", { db, ai });

		await user.click(
			await screen.findByRole("button", { name: "Rotate right" }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("img", { name: "page-1.png" }).dataset.rotation,
			).toBe("90"),
		);
		await user.click(screen.getByText("⋯ Missed a stamp?"));
		await user.click(screen.getByRole("button", { name: "Rescan with AI" }));
		await screen.findByText("No missed stamps found.");
		// The client turns the image on a canvas from this; the file itself is not changed.
		expect(sent.map((image) => image.rotation)).toEqual([90]);

		// Stored per photo: the other page is untouched, and the turn survives a new visit.
		const stored = await db.photos.toArray();
		expect(stored.map((p) => [p.id, p.rotation, p.blob === undefined])).toEqual(
			[
				["page-1.png", 90, false],
				["page-2.png", 0, false],
			],
		);
		cleanup();
		renderApp("/collect/review?photo=page-1.png&tab=photos", { db, ai });
		expect(
			(await screen.findByRole("img", { name: "page-1.png" })).dataset.rotation,
		).toBe("90");
	});
});
