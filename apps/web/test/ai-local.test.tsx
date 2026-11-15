import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

interface Call {
	url: string;
	headers: Record<string, string>;
	body: Record<string, unknown> | null;
}

/** A fetch that records calls and answers with `respond`. */
function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
	const calls: Call[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = String(input);
		calls.push({
			url,
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
		});
		return respond(url);
	};
	return { calls, fetchImpl };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const encodeImage = async () => "data:image/jpeg;base64,eA==";

describe("local AI client", () => {
	it("posts the prompt, image and engine to 127.0.0.1 with the token header", async () => {
		const { calls, fetchImpl } = fakeFetch(() =>
			json({ text: '{"stamps":[]}', engine: "claude" }),
		);
		const answer = await createLocalClient({
			fetchImpl,
			encodeImage,
		}).askAboutImage(local, question);
		expect(answer).toEqual({
			text: '{"stamps":[]}',
			cost: null,
			model: "local/claude",
		});
		expect(calls[0]?.url).toBe("http://127.0.0.1:5000/extract");
		expect(calls[0]?.headers["X-Voyput-Token"]).toBe("tok-abcdefgh");
		expect(calls[0]?.body).toEqual({
			engine: "claude",
			system: "read stamps",
			text: "Photo filename: a.jpg",
			image: "data:image/jpeg;base64,eA==",
		});
	});

	it("says when voyput-local is not running or refuses the token", async () => {
		const down = createLocalClient({
			encodeImage,
			fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")),
		});
		await expect(down.askAboutImage(local, question)).rejects.toThrow(
			"voyput-local is not running on 127.0.0.1:5000",
		);
		const refused = createLocalClient({
			encodeImage,
			fetchImpl: async () => json({ error: "wrong token" }, 401),
		});
		await expect(refused.askAboutImage(local, question)).rejects.toThrow(
			/pair again/,
		);
		const failed = createLocalClient({
			encodeImage,
			fetchImpl: async () => json({ error: "codex exited with code 1" }, 502),
		});
		await expect(failed.askAboutImage(local, question)).rejects.toThrow(
			"voyput-local error 502: codex exited with code 1",
		);
	});

	it("reads the health states: found, wrong token, not running", async () => {
		const found = fakeFetch(() =>
			json({ app: "voyput-local", version: "1", engines: ["codex", "gpt"] }),
		);
		expect(await checkLocalHealth(local, found.fetchImpl)).toEqual({
			state: "found",
			version: "1",
			engines: ["codex"],
		});
		expect(found.calls[0]?.url).toBe("http://127.0.0.1:5000/health");
		expect(found.calls[0]?.headers["X-Voyput-Token"]).toBe("tok-abcdefgh");
		expect(
			await checkLocalHealth(local, async () => json({ error: "x" }, 401)),
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
		const { calls, fetchImpl } = fakeFetch((url) =>
			url.startsWith("http://127.0.0.1")
				? json({ text: "{}", engine: "claude" })
				: json({
						choices: [{ finish_reason: "stop", message: { content: "{}" } }],
					}),
		);
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
		expect(calls.map((call) => new URL(call.url).host)).toEqual([
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
			clone: "node packages/local/src/voyput-local.ts",
		});
		expect(localCommands("http://x", 5000).clone).toBe(
			"node packages/local/src/voyput-local.ts --port 5000",
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
			version: "1",
			engines: ["codex"],
		}));
		renderApp("/settings", { ai });
		expect(
			await screen.findByText("Paired with voyput-local from its link."),
		).toBeTruthy();
		expect((screen.getByLabelText(/^Local/) as HTMLInputElement).checked).toBe(
			true,
		);
		expect(await screen.findByText(/Found · v1 · Codex CLI/)).toBeTruthy();
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
			screen.getByRole("option", { name: "Claude Code (not found)" }),
		).toBeTruthy();
		window.history.replaceState(null, "", "/");
	});

	it("shows Wrong token and Not running", async () => {
		const user = userEvent.setup();
		renderApp("/settings", {
			ai: withHealth((token) =>
				token === "good-token"
					? { state: "not-running" }
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
