export type ReasoningEffort = "low" | "medium" | "high";
/** Who reads the stamps: OpenRouter with a key, or the local engine (ADR 0026). */
export type AiProviderId = "openrouter" | "local";
export type LocalEngine = "auto" | "codex" | "claude";

export interface Settings {
	openRouterKey: string;
	/** OpenRouter model id, e.g. "openai/gpt-6-sol". */
	model: string;
	reasoningEffort: ReasoningEffort;
	/** Days before and after a stamp date that Review compares with photo locations. */
	locationWindowDays: number;
	aiProvider: AiProviderId;
	localEngine: LocalEngine;
	/** Pairing token printed by voyput-local. */
	localToken: string;
	/** voyput-local's port on 127.0.0.1. */
	localPort: number;
}

/** Allowed range of `locationWindowDays`. */
export const LOCATION_WINDOW_MIN = 3;
export const LOCATION_WINDOW_MAX = 60;

/** A whole number of days in range, or null. */
export const parseLocationWindow = (value: unknown): number | null =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value >= LOCATION_WINDOW_MIN &&
	value <= LOCATION_WINDOW_MAX
		? value
		: null;

export const DEFAULT_SETTINGS: Settings = {
	openRouterKey: "",
	// Best on real stamp pages in docs/model-trial-2026-11.md (ADR 0020).
	model: "google/gemini-3.8-flash",
	reasoningEffort: "medium",
	locationWindowDays: 10,
	aiProvider: "openrouter",
	localEngine: "auto",
	localToken: "",
	localPort: 47615,
};

/** A TCP port number, or null. */
export const parsePort = (value: unknown): number | null =>
	typeof value === "number" &&
	Number.isInteger(value) &&
	value >= 1 &&
	value <= 65535
		? value
		: null;

const STORAGE_KEY = "voyput:settings";
const EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

const LOCAL_ENGINES: readonly LocalEngine[] = ["auto", "codex", "claude"];

const isLocalEngine = (value: unknown): value is LocalEngine =>
	typeof value === "string" &&
	(LOCAL_ENGINES as readonly string[]).includes(value);

const isEffort = (value: unknown): value is ReasoningEffort =>
	typeof value === "string" && (EFFORTS as readonly string[]).includes(value);

/** Reads settings from storage; anything missing or malformed falls back to the default. */
export function loadSettings(storage: Storage): Settings {
	try {
		return parseSettings(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}"));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/** Settings from parsed JSON; anything missing or malformed falls back to the default. */
export function parseSettings(raw: unknown): Settings {
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
		locationWindowDays:
			parseLocationWindow(value.locationWindowDays) ??
			DEFAULT_SETTINGS.locationWindowDays,
		aiProvider:
			value.aiProvider === "local" ? "local" : DEFAULT_SETTINGS.aiProvider,
		localEngine: isLocalEngine(value.localEngine)
			? value.localEngine
			: DEFAULT_SETTINGS.localEngine,
		localToken:
			typeof value.localToken === "string"
				? value.localToken
				: DEFAULT_SETTINGS.localToken,
		localPort: parsePort(value.localPort) ?? DEFAULT_SETTINGS.localPort,
	};
}

/** Returns false when the browser refuses to store (full or blocked); settings then live only in memory. */
export function saveSettings(storage: Storage, settings: Settings): boolean {
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(settings));
		return true;
	} catch {
		return false;
	}
}
