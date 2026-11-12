import type { Rotation } from "@voyput/core";
import type { Settings } from "../settings/settings";
import { photoDataUrl } from "./image";

const API = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 10 * 60_000; // busy pages can take minutes with reasoning

export type AiSettings = Pick<
	Settings,
	"openRouterKey" | "model" | "reasoningEffort"
>;

/** One image plus instructions; the model must answer with JSON only. */
export interface ImageQuestion {
	system: string;
	text: string;
	image: { blob: Blob; rotation: Rotation };
}

export interface AiAnswer {
	text: string;
	/** USD charged by OpenRouter, when it reports it. */
	cost: number | null;
}

export interface ModelOption {
	id: string;
	name: string;
}

/** Every AI call of the app. Tests replace it through `AiProvider`. */
export interface AiClient {
	askAboutImage(
		settings: AiSettings,
		question: ImageQuestion,
	): Promise<AiAnswer>;
	/** Models that accept image input. */
	listImageModels(): Promise<ModelOption[]>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** A message the user can act on, from a failed HTTP response. */
export const httpErrorMessage = (
	status: number,
	statusText: string,
): string => {
	if (status === 401 || status === 403)
		return `OpenRouter refused the request (${status}): check your OpenRouter key in Settings.`;
	if (status === 402)
		return "OpenRouter says you are out of credits (402). Add credits and retry.";
	return `OpenRouter error ${status}${statusText ? ` ${statusText}` : ""}`;
};

const errorDetail = (body: unknown): string => {
	if (!isObject(body) || !isObject(body.error)) return "";
	return typeof body.error.message === "string" ? body.error.message : "";
};

const readJson = async (response: Response): Promise<unknown> => {
	try {
		return await response.json();
	} catch {
		return null;
	}
};

const answerFrom = (body: unknown): AiAnswer => {
	const detail = errorDetail(body);
	if (detail) throw new Error(`OpenRouter error: ${detail}`);
	const choice =
		isObject(body) && Array.isArray(body.choices) ? body.choices[0] : null;
	const message = isObject(choice) ? choice.message : null;
	const text = isObject(message) ? message.content : null;
	if (typeof text !== "string" || !text.trim()) {
		const reason = isObject(choice) ? String(choice.finish_reason) : "unknown";
		throw new Error(`the model returned no text (finish reason: ${reason})`);
	}
	const usage = isObject(body) ? body.usage : null;
	const cost =
		isObject(usage) && typeof usage.cost === "number" ? usage.cost : null;
	return { text, cost };
};

export function createOpenRouterClient(
	fetchImpl: typeof fetch = (...args) => fetch(...args),
): AiClient {
	return {
		async askAboutImage(settings, question) {
			const response = await fetchImpl(`${API}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${settings.openRouterKey}`,
					"Content-Type": "application/json",
					"X-Title": "voyput",
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				body: JSON.stringify({
					model: settings.model,
					reasoning: { effort: settings.reasoningEffort },
					response_format: { type: "json_object" },
					usage: { include: true },
					messages: [
						{ role: "system", content: question.system },
						{
							role: "user",
							content: [
								{ type: "text", text: question.text },
								{
									type: "image_url",
									image_url: {
										url: await photoDataUrl(
											question.image.blob,
											question.image.rotation,
										),
									},
								},
							],
						},
					],
				}),
			});
			const body = await readJson(response);
			if (!response.ok) {
				const detail = errorDetail(body);
				throw new Error(
					httpErrorMessage(response.status, response.statusText) +
						(detail && response.status !== 401 && response.status !== 403
							? `: ${detail}`
							: ""),
				);
			}
			return answerFrom(body);
		},

		async listImageModels() {
			const response = await fetchImpl(`${API}/models`);
			if (!response.ok)
				throw new Error(httpErrorMessage(response.status, response.statusText));
			const body = await readJson(response);
			const data = isObject(body) && Array.isArray(body.data) ? body.data : [];
			return data.flatMap((model: unknown): ModelOption[] => {
				if (!isObject(model) || typeof model.id !== "string") return [];
				const modalities = isObject(model.architecture)
					? model.architecture.input_modalities
					: null;
				if (!Array.isArray(modalities) || !modalities.includes("image"))
					return [];
				return [
					{
						id: model.id,
						name: typeof model.name === "string" ? model.name : model.id,
					},
				];
			});
		},
	};
}
