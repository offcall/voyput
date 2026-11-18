import type { Rotation } from "@voyput/core";
import type { Settings } from "../settings/settings";
import { photoDataUrl } from "./image";
import type { LocalHealth } from "./local";

const API = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 10 * 60_000; // busy pages can take minutes with reasoning
const MODELS_TIMEOUT_MS = 30_000;

/** Without a provider, calls go to OpenRouter (e.g. the model-trial script). */
export type AiSettings = Pick<
	Settings,
	"openRouterKey" | "model" | "reasoningEffort"
> &
	Partial<
		Pick<Settings, "aiProvider" | "localEngine" | "localToken" | "localPort">
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
	/** What answered, when the provider says (e.g. "local/codex"). */
	model?: string;
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
	/** Whether voyput-local answers and accepts the token (ADR 0026). */
	localHealth?(
		settings: Pick<AiSettings, "localToken" | "localPort">,
	): Promise<LocalHealth>;
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
	if (status === 429)
		return "Rate limited by OpenRouter (429), try again in a minute";
	return `OpenRouter error ${status}${statusText ? ` ${statusText}` : ""}`;
};

const errorDetail = (body: unknown): string => {
	if (!isObject(body) || !isObject(body.error)) return "";
	return typeof body.error.message === "string" ? body.error.message : "";
};

/** The thrown message for a failed response; key errors leave out the server's words. */
const failureMessage = (response: Response, body: unknown): string => {
	const detail = errorDetail(body);
	return (
		httpErrorMessage(response.status, response.statusText) +
		(detail && response.status !== 401 && response.status !== 403
			? `: ${detail}`
			: "")
	);
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
	const reason = isObject(choice) ? choice.finish_reason : null;
	// "length", "content_filter", "error"…: the text is cut off or missing.
	if (reason !== "stop")
		throw new Error(
			`the model stopped abnormally (finish reason: ${String(reason)})`,
		);
	if (typeof text !== "string" || !text.trim())
		throw new Error("the model returned no text");
	const usage = isObject(body) ? body.usage : null;
	const cost =
		isObject(usage) && typeof usage.cost === "number" ? usage.cost : null;
	return { text, cost };
};

/** Turns a stored photo into an upright data URL. */
export type ImageEncoder = (blob: Blob, rotation: Rotation) => Promise<string>;

export function createOpenRouterClient({
	fetchImpl = (...args) => fetch(...args),
	encodeImage = photoDataUrl,
}: {
	fetchImpl?: typeof fetch;
	encodeImage?: ImageEncoder;
} = {}): AiClient {
	const post = (body: object, key: string) =>
		fetchImpl(`${API}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				"X-Title": "voyput",
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			body: JSON.stringify(body),
		});

	return {
		async askAboutImage(settings, question) {
			const request = {
				model: settings.model,
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
									url: await encodeImage(
										question.image.blob,
										question.image.rotation,
									),
								},
							},
						],
					},
				],
			};
			let response = await post(
				{
					...request,
					reasoning: { effort: settings.reasoningEffort },
					response_format: { type: "json_object" },
				},
				settings.openRouterKey,
			);
			// Some models reject reasoning or JSON mode; the prompt alone asks for JSON.
			// The first 400 is kept: it usually names the real cause.
			let first: string | null = null;
			if (response.status === 400) {
				first = failureMessage(response, await readJson(response));
				response = await post(request, settings.openRouterKey);
			}
			const body = await readJson(response);
			if (!response.ok) {
				const last = failureMessage(response, body);
				throw new Error(
					first === null || first === last
						? last
						: `${first} (retry without reasoning and JSON mode: ${last})`,
				);
			}
			return answerFrom(body);
		},

		async listImageModels() {
			const response = await fetchImpl(`${API}/models`, {
				signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
			});
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
