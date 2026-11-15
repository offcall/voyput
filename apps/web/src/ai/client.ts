import { createLocalClient } from "./local";
import {
	type AiClient,
	type AiSettings,
	createOpenRouterClient,
	type ImageEncoder,
} from "./openrouter";

/** The app's AI client: each call goes to the provider chosen in Settings. */
export function createAiClient(
	options: { fetchImpl?: typeof fetch; encodeImage?: ImageEncoder } = {},
): AiClient {
	const openRouter = createOpenRouterClient(options);
	const local = createLocalClient(options);
	return {
		askAboutImage: (settings, question) =>
			(settings.aiProvider === "local" ? local : openRouter).askAboutImage(
				settings,
				question,
			),
		listImageModels: () => openRouter.listImageModels(),
		localHealth: (settings) =>
			local.localHealth
				? local.localHealth(settings)
				: Promise.resolve({ state: "not-running" }),
	};
}

/** What is missing before the chosen provider can read stamps, or null when ready. */
export function aiSetupNeeded(
	settings: AiSettings,
): { title: string; text: string; action: string } | null {
	if (settings.aiProvider === "local")
		return settings.localToken
			? null
			: {
					title: "Pair the local engine",
					text: "Reading stamps on this computer needs voyput-local running and paired.",
					action: "Pair it in Settings",
				};
	return settings.openRouterKey
		? null
		: {
				title: "An API key is needed",
				text: "Extraction needs your OpenRouter API key.",
				action: "Add it in Settings",
			};
}

/** The model to record with a result when the answer does not name one. */
export const aiModelLabel = (settings: AiSettings): string =>
	settings.aiProvider === "local"
		? `local/${settings.localEngine ?? "auto"}`
		: settings.model;
