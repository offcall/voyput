import { type ServedScript, verifiedCommand } from "../app/servedScripts";
import { DEFAULT_SETTINGS, type LocalEngine } from "../settings/settings";
import { photoDataUrl } from "./image";
import {
	AUTH_HEADER,
	proofMatches,
	randomNonce,
	requestAad,
	responseAad,
	seal,
	sealKey,
	signRequest,
	unseal,
} from "./localAuth";
import type { AiClient, AiSettings, ImageEncoder } from "./openrouter";

/** The script's end-to-end deadline (10 minutes, queue included) plus a minute. */
const REQUEST_TIMEOUT_MS = 11 * 60_000;
const HEALTH_TIMEOUT_MS = 3_000;
export const LOCAL_SCRIPT = "voyput-local.mjs" satisfies ServedScript;

/**
 * The site voyput-local trusts unless started with `--site` (its `SITE_ORIGIN`,
 * packages/local/src/voyput-local.ts). Change both together.
 */
export const DEFAULT_SITE_ORIGIN = "https://voyput.app.offcall.link";

type LocalSettings = Pick<
	AiSettings,
	"localToken" | "localPort" | "localEngine"
>;

export type LocalHealth =
	| {
			state: "found";
			version: string;
			engines: Exclude<LocalEngine, "auto">[];
			/** CLI runs voyput-local does at once. */
			maxJobs: number;
	  }
	| { state: "wrong-token" }
	/** Something answers on the port but cannot prove it knows the token. */
	| { state: "unverified" }
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

/**
 * Asks voyput-local whether it runs and knows our token. The request is signed,
 * never carries the token, and the answer must prove the server knows it.
 */
export async function checkLocalHealth(
	settings: LocalSettings,
	fetchImpl: typeof fetch,
): Promise<LocalHealth> {
	const { token, port } = resolved(settings);
	const signed = await signRequest(token, "GET", "/health", "");
	let response: Response;
	try {
		response = await fetchImpl(`${baseUrl(port)}/health`, {
			headers: { [AUTH_HEADER]: signed.header },
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
	if (!(await proofMatches(token, signed.nonce, "health", body.proof)))
		return { state: "unverified" };
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
		maxJobs:
			typeof body.maxJobs === "number" && body.maxJobs > 0 ? body.maxJobs : 1,
	};
}

/** Why a photo was not sent, from a health answer that is not "found". */
const refusal = (health: LocalHealth, port: number): string => {
	switch (health.state) {
		case "not-running":
			return notRunning(port);
		case "wrong-token":
			return "voyput-local refused the pairing token (401): pair again in Settings.";
		case "unverified":
			return `Something on 127.0.0.1:${port} answers but cannot prove it is your voyput-local. Nothing was sent.`;
		case "error":
			return `voyput-local error: ${health.message}`;
		case "found":
			return "";
	}
};

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
			// Prove the server is ours before the photo leaves the browser.
			const health = await checkLocalHealth(settings, fetchImpl);
			if (health.state !== "found") throw new Error(refusal(health, port));
			// The photo travels encrypted and bound to this request, so whatever
			// holds the port when it arrives learns nothing without the token.
			const now = Date.now();
			const nonce = randomNonce();
			const key = await sealKey(token);
			const body = JSON.stringify(
				await seal(
					key,
					JSON.stringify({
						engine: wanted,
						system: question.system,
						text: question.text,
						image: await encodeImage(
							question.image.blob,
							question.image.rotation,
						),
					}),
					requestAad("POST", "/extract", String(now), nonce),
				),
			);
			const signed = await signRequest(
				token,
				"POST",
				"/extract",
				body,
				now,
				nonce,
			);
			let response: Response;
			try {
				response = await fetchImpl(`${baseUrl(port)}/extract`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						[AUTH_HEADER]: signed.header,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
					body,
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "TimeoutError")
					throw new Error("voyput-local timed out");
				throw new Error(notRunning(port));
			}
			const answer = await readJson(response);
			if (response.status === 401)
				throw new Error(refusal({ state: "wrong-token" }, port));
			if (!response.ok)
				throw new Error(
					`voyput-local error ${response.status}: ${errorOf(answer) || response.statusText}`,
				);
			const opened = await unseal(key, answer, responseAad(nonce));
			if (opened === null)
				throw new Error(
					"voyput-local's answer could not be decrypted with the pairing token; it was dropped.",
				);
			let result: unknown = null;
			try {
				result = JSON.parse(opened);
			} catch {}
			const text = isObject(result) ? result.text : null;
			const engine = isObject(result) ? result.engine : null;
			if (typeof text !== "string" || !text.trim())
				throw new Error("the model returned no text");
			if (typeof engine !== "string")
				throw new Error("voyput-local did not name its engine");
			return { text, cost: null, model: `local/${engine}` };
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

/**
 * Shell commands that start voyput-local: downloaded from `origin` and checked
 * against this build's hash (ADR 0035), or from a clone. A site other than the
 * default passes itself with `--site` so voyput-local lets it in and pairs
 * with it (ADR 0042).
 */
export function localCommands(
	origin: string,
	port = DEFAULT_SETTINGS.localPort,
) {
	const portFlag = port === DEFAULT_SETTINGS.localPort ? "" : ` --port ${port}`;
	const siteFlag = origin === DEFAULT_SITE_ORIGIN ? "" : ` --site ${origin}`;
	const flags = `${portFlag}${siteFlag}`;
	return {
		download: verifiedCommand(origin, LOCAL_SCRIPT, "node", flags),
		clone: `node --experimental-strip-types packages/local/src/voyput-local.ts${flags}`,
	};
}
