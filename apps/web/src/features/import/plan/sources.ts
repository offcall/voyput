import type { VoyputDb } from "../../../db/db";

/** What the user has to build the history from, chosen on the first visit to Collect. */
export type Sources = "photos" | "passport" | "both";

export const SOURCES: readonly Sources[] = ["both", "photos", "passport"];

/** `db.kv` key of the choice (ADR 0024). */
export const SOURCES_KEY = "collect:sources";

export const isSources = (value: unknown): value is Sources =>
	(SOURCES as readonly unknown[]).includes(value);

export const SOURCE_LABELS: Record<Sources, string> = {
	photos: "Photos only",
	passport: "Passport only",
	both: "Both",
};

export async function saveSources(db: VoyputDb, sources: Sources) {
	await db.kv.put({ key: SOURCES_KEY, value: sources });
}
