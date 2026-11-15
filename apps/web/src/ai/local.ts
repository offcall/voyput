import { DEFAULT_SETTINGS, type LocalEngine } from "../settings/settings";
import { photoDataUrl } from "./image";
import type { AiClient, AiSettings, ImageEncoder } from "./openrouter";

/** Same timeout as the script's CLI run, plus a minute for the trip. */
const REQUEST_TIMEOUT_MS = 11 * 60_000;
const HEALTH_TIMEOUT_MS = 3_000;
export const LOCAL_TOKEN_HEADER = "X-Voyput-Token";
export const LOCAL_SCRIPT = "voyput-local.mjs";

type LocalSettings = Pick<
	AiSettings,
	"localToken" | "localPort" | "localEngine"
>;

export type LocalHealth =
	| { state: "found"; version: string; engines: Exclude<LocalEngine, "auto">[] }
	| { state: "wrong-token" }
	| { state: "not-running" }
	| { state: "error"; message: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const baseUrl = (port: number) => `http://127.0.0.1:${port}`;

const resolved = (settings: LocalSettings) => ({
	token: settings.localToken ?? "",
	port: settings.localPort ?? DEFAULT_SETTINGS.localPort,
	engine: settings.localEngine ?? DEFAULT_SETTINGS.localEngine,
});

const readJson = async (response: Response): Promise<unknown> => {
	try {
		return await response.json();
	} catch {
		return null;
	}
};

const errorOf = (body: unknown): string =>
	isObject(body) && typeof body.error === "string" ? body.error : "";

const notRunning = (port: number) =>
	`voyput-local is not running on 127.0.0.1:${port}. Start it (see Settings), then retry.`;

/** Asks voyput-local whether it runs and knows our token. */
export async function checkLocalHealth(
	settings: LocalSettings,
	fetchImpl: typeof fetch,
): Promise<LocalHealth> {
	const { token, port } = resolved(settings);
	let response: Response;
	try {
		response = await fetchImpl(`${baseUrl(port)}/health`, {
			headers: { [LOCAL_TOKEN_HEADER]: token },
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
		});
	} catch {
		return { state: "not-running" };
	}
	if (response.status === 401) return { state: "wrong-token" };
	const body = await readJson(response);
	if (!response.ok || !isObject(body) || body.app !== "voyput-local")
		return {
			state: "error",
			message: errorOf(body) || `unexpected answer ${response.status}`,
		};
	const engines = Array.isArray(body.engines)
		? body.engines.filter(
				(engine): engine is "codex" | "claude" =>
					engine === "codex" || engine === "claude",
			)
		: [];
	return {
		state: "found",
		version: typeof body.version === "string" ? body.version : "?",
		engines,
	};
}

/** Reads stamps through voyput-local on this computer. Has no model list. */
export function createLocalClient({
	fetchImpl = (...args) => fetch(...args),
	encodeImage = photoDataUrl,
}: {
	fetchImpl?: typeof fetch;
	encodeImage?: ImageEncoder;
} = {}): AiClient {
	return {
		async askAboutImage(settings, question) {
			const { token, port, engine: wanted } = resolved(settings);
			const image = await encodeImage(
				question.image.blob,
				question.image.rotation,
			);
			let response: Response;
			try {
				response = await fetchImpl(`${baseUrl(port)}/extract`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						[LOCAL_TOKEN_HEADER]: token,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
					body: JSON.stringify({
						engine: wanted,
						system: question.system,
						text: question.text,
						image,
					}),
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "TimeoutError")
					throw new Error("voyput-local timed out");
				throw new Error(notRunning(port));
			}
			const body = await readJson(response);
			if (response.status === 401)
				throw new Error(
					"voyput-local refused the pairing token (401): pair again in Settings.",
				);
			if (!response.ok)
				throw new Error(
					`voyput-local error ${response.status}: ${errorOf(body) || response.statusText}`,
				);
			const text = isObject(body) ? body.text : null;
			if (typeof text !== "string" || !text.trim())
				throw new Error("the model returned no text");
			const engine =
				isObject(body) && typeof body.engine === "string" ? body.engine : null;
			return {
				text,
				cost: null,
				...(engine ? { model: `local/${engine}` } : {}),
			};
		},
		listImageModels: () => Promise.resolve([]),
		localHealth: (settings) => checkLocalHealth(settings, fetchImpl),
	};
}

/**
 * The token and port from a `#local=<token>&port=<n>` pairing link, or null.
 * voyput-local leaves the port out when it is the default.
 */
export function parsePairingHash(
	hash: string,
): { localToken: string; localPort: number } | null {
	const params = new URLSearchParams(hash.replace(/^#/, ""));
	const token = params.get("local")?.trim();
	if (!token || !/^[A-Za-z0-9_-]{8,200}$/.test(token)) return null;
	const port = params.has("port") ? Number(params.get("port")) : NaN;
	return {
		localToken: token,
		localPort:
			Number.isInteger(port) && port >= 1 && port <= 65535
				? port
				: DEFAULT_SETTINGS.localPort,
	};
}

/** Shell commands that start voyput-local: downloaded from `origin`, or from a clone. */
export function localCommands(origin: string, port: number) {
	const portFlag = port === DEFAULT_SETTINGS.localPort ? "" : ` --port ${port}`;
	return {
		download: `curl -fsSL ${origin}/${LOCAL_SCRIPT} -o ${LOCAL_SCRIPT} && node ${LOCAL_SCRIPT}${portFlag}`,
		clone: `node packages/local/src/voyput-local.ts${portFlag}`,
	};
}
