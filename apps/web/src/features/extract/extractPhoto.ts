import {
	buildStampPrompt,
	type Passport,
	type PhotoExtraction,
	parsePhotoResponse,
	type Stamp,
} from "@voyput/core";
import { aiModelLabel } from "../../ai/client";
import type { AiClient, AiSettings } from "../../ai/openrouter";
import type { PhotoRecord, VoyputDb } from "../../db/db";
import { staysAfterEvidenceChange } from "../trips/evidenceChange";

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * Reads the stamps on one photo and stores the result. Never throws: a failure is
 * stored as a "failed" extraction, and the photo's earlier stamps are kept.
 * A success replaces the photo's earlier unreviewed AI stamps; reviewed stamps and
 * stamps added by hand stay; stored stays built on a replaced stamp are
 * marked (`staysAfterEvidenceChange`). Nothing is stored once the photo is gone (deleted
 * while the model was answering).
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
		model = aiModelLabel(settings),
	): PhotoExtraction => ({
		photoId: photo.id,
		status,
		notes,
		model,
		seconds: Math.round((performance.now() - started) / 1000),
		finishedAt: new Date().toISOString(),
	});

	try {
		const answer = await ai.askAboutImage(settings, {
			system: buildStampPrompt(range),
			text: `Photo filename: ${JSON.stringify(photo.name)}`,
			image: { blob: photo.blob, rotation: photo.rotation },
		});
		const result = parsePhotoResponse(answer.text, range);
		const stamps: Stamp[] = result.stamps.map((read) => ({
			...read,
			id: crypto.randomUUID(),
			passportId: passport.id,
			photoId: photo.id,
			source: "ai",
			reviewed: false,
		}));
		await db.transaction(
			"rw",
			[db.photos, db.stamps, db.extractions, db.stays],
			async () => {
				if (!(await db.photos.get(photo.id))) return;
				const replaced = await db.stamps
					.where("photoId")
					.equals(photo.id)
					.filter((stamp) => stamp.source === "ai" && !stamp.reviewed)
					.primaryKeys();
				await db.stamps.bulkDelete(replaced);
				if (replaced.length > 0)
					await staysAfterEvidenceChange(db, {
						removedStamps: new Set(replaced),
					});
				await db.stamps.bulkAdd(stamps);
				await db.extractions.put(finish("ok", result.notes, answer.model));
			},
		);
	} catch (error) {
		try {
			await db.transaction("rw", db.photos, db.extractions, async () => {
				if (await db.photos.get(photo.id))
					await db.extractions.put(finish("failed", errorMessage(error)));
			});
		} catch {
			// Storage is broken too; the photo simply shows as not extracted.
		}
	}
}
