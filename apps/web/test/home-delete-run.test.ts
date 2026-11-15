import type { Passport } from "@voyput/core";
import { describe, expect, it } from "vitest";
import type { AiAnswer, AiClient } from "../src/ai/openrouter";
import { type PhotoRecord, VoyputDb } from "../src/db/db";
import { extractPhoto } from "../src/features/extract/extractPhoto";
import { runsFor } from "../src/features/extract/runs";
import { deleteEverything } from "../src/features/home/deleteEverything";
import { offlineAi } from "./renderApp";

const passport: Passport = {
	id: "p1",
	name: "Blue",
	validFrom: null,
	validTo: null,
	createdAt: "2024-01-01T00:00:00Z",
};

const answer: AiAnswer = {
	cost: null,
	text: JSON.stringify({
		notes: "1 stamp",
		stamps: [
			{
				direction: "entry",
				dateText: "10.07.19",
				date: "2019-07-10",
				country: "MD",
				countryCode: "MD",
				location: null,
				confidence: 90,
			},
		],
	}),
};

describe("delete everything during an extraction run", () => {
	it("stops queued reads and stores nothing from late answers", async () => {
		const db = new VoyputDb("home-delete-run");
		await db.passports.put(passport);
		const photos: PhotoRecord[] = Array.from({ length: 5 }, (_, i) => ({
			id: `ph${i}`,
			passportId: "p1",
			name: `page-${i}.png`,
			mimeType: "image/png" as const,
			rotation: 0 as const,
			addedAt: "2024-01-01T00:00:00Z",
			blob: new Blob(["x"], { type: "image/png" }),
		}));
		await db.photos.bulkPut(photos);

		// Every request waits until the test answers it, one success and one failure.
		const pending: {
			resolve: (a: AiAnswer) => void;
			reject: (e: Error) => void;
		}[] = [];
		const ai: AiClient = {
			...offlineAi,
			askAboutImage: () =>
				new Promise<AiAnswer>((resolve, reject) =>
					pending.push({ resolve, reject }),
				),
		};
		const settings = {
			openRouterKey: "k",
			model: "test/model",
			reasoningEffort: "low" as const,
		};
		const runs = runsFor(db);
		const run = runs.start(photos, (photo) =>
			extractPhoto(db, ai, settings, passport, photo),
		);
		await expect.poll(() => pending.length).toBe(3);

		await deleteEverything(db);
		expect(runs.snapshot().active.size).toBe(0);
		pending[0]?.resolve(answer);
		pending[1]?.reject(new Error("timeout"));
		pending[2]?.resolve(answer);
		await run;

		expect(pending.length).toBe(3);
		const counts = await Promise.all(db.tables.map((table) => table.count()));
		expect(counts.every((count) => count === 0)).toBe(true);
	});
});
