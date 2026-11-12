import {
	buildStampPrompt,
	type Passport,
	type PhotoExtraction,
	parsePhotoResponse,
	type Stamp,
} from "@voyput/core";
import type { AiClient, AiSettings } from "../../ai/openrouter";
import type { PhotoRecord, VoyputDb } from "../../db/db";

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Reads the stamps on one photo and stores the result. Never throws: a failure is
 * stored as a "failed" extraction, and the photo's earlier stamps are kept.
 * A success replaces the photo's earlier AI stamps; stamps added by hand stay.
 */
export async function extractPhoto(
	db: VoyputDb,
	ai: AiClient,
	settings: AiSettings,
	passport: Passport,
	photo: PhotoRecord,
): Promise<void> {
	const range = { from: passport.validFrom, to: passport.validTo };
	const started = performance.now();
	const finish = (
		status: PhotoExtraction["status"],
		notes: string,
	): PhotoExtraction => ({
		photoId: photo.id,
		status,
		notes,
		model: settings.model,
		seconds: Math.round((performance.now() - started) / 1000),
		finishedAt: new Date().toISOString(),
	});

	let result: ReturnType<typeof parsePhotoResponse>;
	try {
		const answer = await ai.askAboutImage(settings, {
			system: buildStampPrompt(range),
			text: `Photo filename: ${JSON.stringify(photo.name)}`,
			image: { blob: photo.blob, rotation: photo.rotation },
		});
		result = parsePhotoResponse(answer.text, range);
	} catch (error) {
		await db.extractions.put(finish("failed", errorMessage(error)));
		return;
	}

	const stamps: Stamp[] = result.stamps.map((read) => ({
		...read,
		id: crypto.randomUUID(),
		passportId: passport.id,
		photoId: photo.id,
		source: "ai",
		reviewed: false,
	}));
	await db.transaction("rw", db.stamps, db.extractions, async () => {
		await db.stamps
			.where("photoId")
			.equals(photo.id)
			.filter((stamp) => stamp.source === "ai")
			.delete();
		await db.stamps.bulkAdd(stamps);
		await db.extractions.put(finish("ok", result.notes));
	});
}
