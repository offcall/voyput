import {
	buildRescanText,
	buildStampPrompt,
	buildValidateText,
	type DateRange,
	missedStamps,
	type NearbyPhoto,
	parsePhotoResponse,
	parseValidateResponse,
	type ReadStamp,
	type RescanExistingStamp,
	type Stamp,
	type StampCheck,
	VALIDATE_SYSTEM,
	type ValidateResult,
} from "@voyput/core";
import type { AiClient, AiSettings } from "../../ai/openrouter";
import type { PhotoRecord } from "../../db/db";

/** Asks the model whether one stamp record matches its photo. */
export async function validateStamp(
	ai: AiClient,
	settings: AiSettings,
	photo: PhotoRecord,
	stamp: Stamp,
	check: StampCheck,
	nearby: readonly NearbyPhoto[],
): Promise<ValidateResult> {
	const dismissed = stamp.dismissed ?? {};
	const answer = await ai.askAboutImage(settings, {
		system: VALIDATE_SYSTEM,
		text: buildValidateText(
			{ ...stamp, problem: dismissed.problem ? null : stamp.problem },
			{
				icloudCheck: dismissed.icloudCheck ? "" : check.icloudCheck,
				suggestion: dismissed.suggestion ? "" : check.suggestion,
			},
			nearby,
		),
		image: { blob: photo.blob, rotation: photo.rotation },
	});
	return parseValidateResponse(answer.text);
}

const existingOf = (stamp: Stamp): RescanExistingStamp => ({
	direction: stamp.direction,
	borderCrossing: stamp.borderCrossing,
	dateText: stamp.dateText,
	date: stamp.date,
	country: stamp.country,
	countryCode: stamp.countryCode,
	location: stamp.location,
});

/** Reads the photo again and returns only the stamps that are not on it yet. */
export async function rescanPhoto(
	ai: AiClient,
	settings: AiSettings,
	photo: PhotoRecord,
	range: DateRange,
	stamps: readonly Stamp[],
	hint: string,
): Promise<ReadStamp[]> {
	const answer = await ai.askAboutImage(settings, {
		system: buildStampPrompt(range),
		text: buildRescanText(photo.name, stamps.map(existingOf), hint),
		image: { blob: photo.blob, rotation: photo.rotation },
	});
	return missedStamps(parsePhotoResponse(answer.text, range).stamps, stamps);
}
