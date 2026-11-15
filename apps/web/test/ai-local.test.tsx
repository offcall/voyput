import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
	type Deps,
	handle,
	NonceGuard,
} from "../../../packages/local/src/voyput-local";
import { aiSetupNeeded, createAiClient } from "../src/ai/client";
import {
	checkLocalHealth,
	createLocalClient,
	type LocalHealth,
	localCommands,
	parsePairingHash,
} from "../src/ai/local";
import type { AiClient } from "../src/ai/openrouter";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings/settings";
import { offlineAi, renderApp } from "./renderApp";

const question = {
	system: "read stamps",
	text: "Photo filename: a.jpg",
	image: { blob: new Blob(["x"]), rotation: 0 as const },
};
const local = {
	...DEFAULT_SETTINGS,
	aiProvider: "local" as const,
	localToken: "tok-abcdefgh",
	localPort: 5000,
	localEngine: "claude" as const,
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const encodeImage = async () => "data:image/jpeg;base64,eA==";

interface Call {
	url: string;
	headers: Record<string, string>;
	body: string;
}

/**
 * A fetch backed by the real voyput-local request handler (no sockets, no CLI),
 * so the app's WebCrypto signatures meet the script's verifier.
 */
function localServer({
	token = local.localToken,
	runner = { run: async () => '{"stamps":[]}' },
	tamper = (body: string) => body,
}: {
	token?: string;
	runner?: Deps["runner"];
	tamper?: (body: string) => string;
} = {}) {
	const deps: Deps = {
		token,
		port: 5000,
		engines: ["claude", "codex"],
		runner,
		nonces: new NonceGuard(),
		busy: () => false,
	};
	const calls: Call[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = new URL(String(input));
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(init?.headers ?? {}))
			headers[key.toLowerCase()] = String(value);
		const body = typeof init?.body === "string" ? init.body : "";
		calls.push({ url: url.href, headers, body });
		const response = await handle(
			{
				method: init?.method ?? "GET",
				path: url.pathname,
				body,
				headers: {
					...headers,
					host: url.host,
					origin: "http://localhost:5173",
					"content-length": String(new TextEncoder().encode(body).length),
				},
			},
			deps,
			Date.now(),
		);
		return new Response(tamper(response.body), {
			status: response.status,
			headers: response.headers,
		});
	};
	return { calls, fetchImpl };
}

const sent = (calls: Call[]) =>
	calls.map((call) => JSON.stringify(call)).join("\n");

describe("local AI client", () => {
	it("proves the server, then posts the prompt and image signed, never the token", async () => {
		const server = localServer();
		const answer = await createLocalClient({
			fetchImpl: server.fetchImpl,
			encodeImage,
		}).askAboutImage(local, question);
		expect(answer).toEqual({
			text: '{"stamps":[]}',
			cost: null,
			model: "local/claude",
		});
		expect(server.calls.map((call) => call.url)).toEqual([
			"http://127.0.0.1:5000/health",
			"http://127.0.0.1:5000/extract",
		]);
		expect(server.calls[1]?.headers["x-voyput-auth"]).toMatch(/^v2\./);
		expect(JSON.parse(server.calls[1]?.body ?? "")).toEqual({
			engine: "claude",
			system: "read stamps",
			text: "Photo filename: a.jpg",
			image: "data:image/jpeg;base64,eA==",
		});
		expect(sent(server.calls)).not.toContain(local.localToken);
	});

	it("sends no photo to a server that cannot prove it knows the token", async () => {
		const calls: string[] = [];
		const impostor = createLocalClient({
			encodeImage,
			fetchImpl: async (input) => {
				calls.push(String(input));
				return json({
					app: "voyput-local",
					version: "2",
					engines: ["claude"],
					maxJobs: 3,
					proof: "made-up",
				});
			},
		});
		await expect(impostor.askAboutImage(local, question)).rejects.toThrow(
			"cannot prove it is your voyput-local. Nothing was sent.",
		);
		expect(calls).toEqual(["http://127.0.0.1:5000/health"]);
		expect(await impostor.localHealth?.(local)).toEqual({
			state: "unverified",
		});
	});

	it("drops an answer whose proof does not match", async () => {
		const server = localServer({
			tamper: (body) => body.replace('"engine":"claude"', '"engine":"codex"'),
		});
		await expect(
			createLocalClient({
				fetchImpl: server.fetchImpl,
				encodeImage,
			}).askAboutImage(local, question),
		).rejects.toThrow("did not prove");
	});

	it("says when voyput-local is not running, refuses the token or fails", async () => {
		const down = createLocalClient({
			encodeImage,
			fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
		});
		await expect(down.askAboutImage(local, question)).rejects.toThrow(
			"voyput-local is not running on 127.0.0.1:5000",
		);
		const other = localServer({ token: "someone-elses-token" });
		await expect(
			createLocalClient({
				fetchImpl: other.fetchImpl,
				encodeImage,
			}).askAboutImage(local, question),
		).rejects.toThrow(/pair again/);
		expect(other.calls).toHaveLength(1);
		const failing = localServer({
			runner: { run: () => Promise.reject(new Error("claude exited")) },
		});
		await expect(
			createLocalClient({
				fetchImpl: failing.fetchImpl,
				encodeImage,
			}).askAboutImage(local, question),
		).rejects.toThrow("voyput-local error 502: claude exited");
	});

	it("reads the health states: found, wrong token, not running", async () => {
		expect(await checkLocalHealth(local, localServer().fetchImpl)).toEqual({
			state: "found",
			version: "2",
			engines: ["claude", "codex"],
			maxJobs: 3,
		});
		expect(
			await checkLocalHealth(
				local,
				localServer({ token: "someone-elses-token" }).fetchImpl,
			),
		).toEqual({ state: "wrong-token" });
		expect(
			await checkLocalHealth(local, () =>
				Promise.reject(new TypeError("Failed to fetch")),
			),
		).toEqual({ state: "not-running" });
	});
});

describe("provider switch", () => {
	it("sends calls to the provider chosen in settings", async () => {
		const server = localServer();
		const hosts: string[] = [];
		const fetchImpl: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			hosts.push(url.host);
			return url.hostname === "127.0.0.1"
				? server.fetchImpl(input, init)
				: json({
						choices: [{ finish_reason: "stop", message: { content: "{}" } }],
					});
		};
		const ai = createAiClient({ fetchImpl, encodeImage });
		await ai.askAboutImage(local, question);
		await ai.askAboutImage(
			{ ...local, aiProvider: "openrouter", openRouterKey: "sk" },
			question,
		);
		await ai.askAboutImage(
			{ openRouterKey: "sk", model: "m", reasoningEffort: "low" },
			question,
		);
		expect(hosts).toEqual([
			"127.0.0.1:5000",
			"127.0.0.1:5000",
			"openrouter.ai",
			"openrouter.ai",
		]);
	});

	it("asks for a token on Local and a key on OpenRouter", () => {
		expect(aiSetupNeeded({ ...local, localToken: "" })?.title).toBe(
			"Pair the local engine",
		);
		expect(aiSetupNeeded(local)).toBeNull();
		expect(aiSetupNeeded(DEFAULT_SETTINGS)?.title).toBe("An API key is needed");
	});

	it("reads pairing links and builds the commands", () => {
		expect(parsePairingHash("#local=tok-abcdefgh")).toEqual({
			localToken: "tok-abcdefgh",
			localPort: 47615,
		});
		expect(parsePairingHash("#local=tok-abcdefgh&port=5000")).toEqual({
			localToken: "tok-abcdefgh",
			localPort: 5000,
		});
		expect(parsePairingHash("#/import")).toBeNull();
		expect(parsePairingHash("#local=<script>")).toBeNull();
		expect(localCommands("https://voyput.app.offcall.link", 47615)).toEqual({
			download:
				"curl -fsSL https://voyput.app.offcall.link/voyput-local.mjs -o voyput-local.mjs && node voyput-local.mjs",
			clone:
				"node --experimental-strip-types packages/local/src/voyput-local.ts",
		});
		expect(localCommands("http://x", 5000).clone).toBe(
			"node --experimental-strip-types packages/local/src/voyput-local.ts --port 5000",
		);
	});
});

const withHealth = (
	health: (token: string) => LocalHealth,
): AiClient & { asked: string[] } => {
	const asked: string[] = [];
	return {
		...offlineAi,
		asked,
		localHealth: async (settings) => {
			asked.push(settings.localToken ?? "");
			return health(settings.localToken ?? "");
		},
	};
};

describe("Settings AI card", () => {
	it("pairs from the link voyput-local prints and shows Found", async () => {
		window.history.replaceState(null, "", "/settings#local=tok-abcdefgh");
		const ai = withHealth(() => ({
			state: "found",
			version: "2",
			engines: ["codex"],
			maxJobs: 3,
		}));
		renderApp("/settings", { ai });
		expect(
			await screen.findByText("Paired with voyput-local from its link."),
		).toBeTruthy();
		expect((screen.getByLabelText(/^Local/) as HTMLInputElement).checked).toBe(
			true,
		);
		expect(await screen.findByText(/Found · v2 · Codex CLI/)).toBeTruthy();
		expect(window.location.hash).toBe("");
		expect(ai.asked).toContain("tok-abcdefgh");
		await waitFor(() =>
			expect(loadSettings(localStorage)).toMatchObject({
				aiProvider: "local",
				localToken: "tok-abcdefgh",
			}),
		);
		expect(screen.getByText(/only on your own computer/)).toBeTruthy();
		expect(
			screen.getByText(
				`curl -fsSL ${window.location.origin}/voyput-local.mjs -o voyput-local.mjs && node voyput-local.mjs`,
			),
		).toBeTruthy();
		expect(
			screen.getByRole("option", { name: "Claude Code (not available)" }),
		).toBeTruthy();
		window.history.replaceState(null, "", "/");
	});

	it("shows Wrong token, Not running and an unproven server", async () => {
		const user = userEvent.setup();
		renderApp("/settings", {
			ai: withHealth((token) =>
				token === "good-token"
					? { state: "not-running" }
					: token === "fake-server"
						? { state: "unverified" }
						: { state: "wrong-token" },
			),
		});
		await user.click(await screen.findByLabelText(/^Local/));
		expect(await screen.findByText("Not paired")).toBeTruthy();
		await user.type(screen.getByLabelText("Pairing token"), "bad-token");
		expect(await screen.findByText("Wrong token")).toBeTruthy();
		const field = screen.getByLabelText("Pairing token");
		await user.clear(field);
		await user.type(field, "good-token");
		expect(await screen.findByText("Not running")).toBeTruthy();
		await user.clear(field);
		await user.type(field, "fake-server");
		expect(await screen.findByText("Not your voyput-local")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toMatch(
			/no photo will be sent/,
		);
	});

	it("keeps the OpenRouter fields under OpenRouter", async () => {
		const user = userEvent.setup();
		renderApp("/settings");
		await user.click(await screen.findByLabelText(/^Local/));
		expect(screen.queryByLabelText("API key")).toBeNull();
		await user.click(screen.getByLabelText(/^OpenRouter/));
		expect(screen.getByLabelText("API key")).toBeTruthy();
	});

	it("asks Extract to pair the local engine when Local has no token", async () => {
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ aiProvider: "local", openRouterKey: "sk-or-test" }),
		);
		renderApp("/collect/extract");
		expect(await screen.findByText("Pair the local engine")).toBeTruthy();
	});
});
