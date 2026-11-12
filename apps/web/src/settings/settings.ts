export type ReasoningEffort = "low" | "medium" | "high";

export interface Settings {
	openRouterKey: string;
	/** OpenRouter model id, e.g. "openai/gpt-6-sol". */
	model: string;
	reasoningEffort: ReasoningEffort;
}

export const DEFAULT_SETTINGS: Settings = {
	openRouterKey: "",
	model: "openai/gpt-6-sol",
	reasoningEffort: "medium",
};

const STORAGE_KEY = "voyput:settings";
const EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

const isEffort = (value: unknown): value is ReasoningEffort =>
	typeof value === "string" && (EFFORTS as readonly string[]).includes(value);

/** Reads settings from storage; anything missing or malformed falls back to the default. */
export function loadSettings(storage: Storage): Settings {
	let raw: unknown;
	try {
		raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
	if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
	const value = raw as Record<string, unknown>;
	return {
		openRouterKey:
			typeof value.openRouterKey === "string"
				? value.openRouterKey
				: DEFAULT_SETTINGS.openRouterKey,
		model:
			typeof value.model === "string" && value.model
				? value.model
				: DEFAULT_SETTINGS.model,
		reasoningEffort: isEffort(value.reasoningEffort)
			? value.reasoningEffort
			: DEFAULT_SETTINGS.reasoningEffort,
	};
}

export function saveSettings(storage: Storage, settings: Settings): void {
	storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
