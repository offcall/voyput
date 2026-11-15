import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	admit,
	childEnv,
	claudeAnswer,
	claudeCommand,
	codexCommand,
	DEFAULT_PORT,
	type Deps,
	type ExtractJob,
	findOnPath,
	type HeadRequest,
	handle,
	isAllowedOrigin,
	limitJobs,
	MAX_BODY_BYTES,
	NonceGuard,
	pairingLink,
	parseExtractBody,
	type Runner,
	requestLines,
	responseProof,
	sha256Hex,
	tempDirPid,
} from "../src/voyput-local";

const TOKEN = "test-token-0123456789abcdef";
const NOW = 1_800_000_000_000;
const IMAGE = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
let nonceCount = 0;

/** Signs like the app does (`apps/web/src/ai/localAuth.ts`). */
function sign(
	method: string,
	path: string,
	body: string,
	{
		token = TOKEN,
		now = NOW,
		nonce = `nonce-${++nonceCount}-abcdefghijk`,
	} = {},
) {
	const bodyHash = sha256Hex(body);
	const mac = createHmac("sha256", token)
		.update(requestLines(method, path, String(now), nonce, bodyHash).join("\n"))
		.digest("base64url");
	return { header: `v2.${now}.${nonce}.${bodyHash}.${mac}`, nonce };
}

function depsWith(
	runner: Runner = { run: async () => '{"stamps":[]}' },
	engines: Deps["engines"] = ["claude", "codex"],
	busy = false,
): Deps & { jobs: ExtractJob[] } {
	const jobs: ExtractJob[] = [];
	return {
		token: TOKEN,
		port: DEFAULT_PORT,
		engines,
		jobs,
		nonces: new NonceGuard(),
		busy: () => busy,
		runner: {
			run: (job, signal, deadline) => {
				jobs.push(job);
				return runner.run(job, signal, deadline);
			},
		},
	};
}

const BASE_HEADERS = {
	host: `127.0.0.1:${DEFAULT_PORT}`,
	origin: "https://voyput.app.offcall.link",
};

function request(
	method: string,
	path: string,
	body = "",
	headers: HeadRequest["headers"] = {},
	signOptions: Parameters<typeof sign>[3] = {},
) {
	const auth = sign(method, path, body, signOptions);
	return {
		method,
		path,
		body,
		nonce: auth.nonce,
		headers: {
			...BASE_HEADERS,
			"x-voyput-auth": auth.header,
			"content-length": String(Buffer.byteLength(body)),
			...headers,
		},
	};
}

const extract = (value: unknown) =>
	request("POST", "/extract", JSON.stringify(value));

describe("voyput-local authentication", () => {
	it("answers a signed /health with engines and a proof bound to the nonce", async () => {
		const req = request("GET", "/health");
		const response = await handle(req, depsWith(), NOW);
		expect(response.status).toBe(200);
		const body = JSON.parse(response.body);
		expect(body).toMatchObject({
			app: "voyput-local",
			version: "2",
			engines: ["claude", "codex"],
			maxJobs: 3,
		});
		expect(body.proof).toBe(responseProof(TOKEN, req.nonce, "health"));
		expect(response.headers["access-control-allow-origin"]).toBe(
			"https://voyput.app.offcall.link",
		);
	});

	it("answers 401 to unsigned, wrongly signed, old and replayed requests", async () => {
		const deps = depsWith();
		const unsigned = request("GET", "/health", "", {
			"x-voyput-auth": undefined,
		});
		expect((await handle(unsigned, deps, NOW)).status).toBe(401);
		const wrong = request("GET", "/health", "", {}, { token: "other-token" });
		expect((await handle(wrong, deps, NOW)).status).toBe(401);
		const old = request("GET", "/health", "", {}, { now: NOW - 61_000 });
		expect((await handle(old, deps, NOW)).status).toBe(401);
		const fresh = request("GET", "/health");
		expect((await handle(fresh, deps, NOW)).status).toBe(200);
		expect((await handle(fresh, deps, NOW + 1000)).status).toBe(401);
	});

	it("never accepts the token itself in place of a signature", async () => {
		const response = await handle(
			request("GET", "/health", "", {
				"x-voyput-auth": TOKEN,
				"x-voyput-token": TOKEN,
			}),
			depsWith(),
			NOW,
		);
		expect(response.status).toBe(401);
	});

	it("refuses a body that differs from the signed one", async () => {
		const signed = request(
			"POST",
			"/extract",
			JSON.stringify({ image: IMAGE }),
		);
		const response = await handle(
			{ ...signed, body: JSON.stringify({ image: "swapped" }) },
			depsWith(),
			NOW,
		);
		expect(response.status).toBe(400);
	});
});

describe("voyput-local checks before the body", () => {
	const statusOf = (
		req: HeadRequest,
		deps: Deps = depsWith(),
	): number | "admitted" => {
		const result = admit(req, deps, NOW);
		return "response" in result ? result.response.status : "admitted";
	};

	it("refuses other origins and other hosts without CORS headers", () => {
		const evil = admit(
			request("GET", "/health", "", { origin: "https://evil.example" }),
			depsWith(),
			NOW,
		);
		if (!("response" in evil)) throw new Error("expected a response");
		expect(evil.response.status).toBe(403);
		expect(
			evil.response.headers["access-control-allow-origin"],
		).toBeUndefined();
		expect(
			statusOf(request("GET", "/health", "", { host: "evil.example:47615" })),
		).toBe(403);
	});

	it("allows the site and localhost dev origins only", () => {
		expect(isAllowedOrigin("https://voyput.app.offcall.link")).toBe(true);
		expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
		expect(isAllowedOrigin("http://127.0.0.1:5180")).toBe(true);
		expect(isAllowedOrigin("http://voyput.app.offcall.link")).toBe(false);
		expect(isAllowedOrigin("https://localhost.evil.example")).toBe(false);
		expect(isAllowedOrigin("http://localhost:5173.evil.example")).toBe(false);
	});

	it("answers CORS and Private Network Access preflights unsigned", () => {
		const result = admit(
			{
				method: "OPTIONS",
				path: "/extract",
				headers: {
					...BASE_HEADERS,
					"access-control-request-private-network": "true",
				},
			},
			depsWith(),
			NOW,
		);
		if (!("response" in result)) throw new Error("expected a response");
		expect(result.response.status).toBe(204);
		expect(
			result.response.headers["access-control-allow-private-network"],
		).toBe("true");
		expect(result.response.headers["access-control-allow-headers"]).toContain(
			"x-voyput-auth",
		);
	});

	it("refuses unknown paths, missing or oversized lengths and a full queue", () => {
		expect(statusOf(request("GET", "/files"))).toBe(404);
		expect(
			statusOf(
				request("POST", "/extract", "{}", { "content-length": undefined }),
			),
		).toBe(411);
		expect(
			statusOf(
				request("POST", "/extract", "{}", {
					"content-length": String(MAX_BODY_BYTES + 1),
				}),
			),
		).toBe(413);
		expect(
			statusOf(
				request("POST", "/extract", "{}"),
				depsWith(undefined, undefined, true),
			),
		).toBe(503);
		expect(statusOf(request("POST", "/extract", "{}"))).toBe("admitted");
	});
});

describe("voyput-local extraction", () => {
	it("runs the chosen engine and proves its answer", async () => {
		const deps = depsWith();
		const req = extract({
			engine: "claude",
			system: "sys",
			text: "photo",
			image: IMAGE,
		});
		const response = await handle(req, deps, NOW);
		expect(response.status).toBe(200);
		const body = JSON.parse(response.body);
		expect(body).toMatchObject({ text: '{"stamps":[]}', engine: "claude" });
		expect(body.proof).toBe(
			responseProof(TOKEN, req.nonce, 'claude\n{"stamps":[]}'),
		);
		expect(deps.jobs[0]?.image.mediaType).toBe("image/png");
		expect(deps.jobs[0]?.image.data.toString()).toBe("png");
	});

	it("prefers Claude Code for auto, and says when Codex is off", async () => {
		const deps = depsWith();
		await handle(
			extract({ engine: "auto", system: "", text: "", image: IMAGE }),
			deps,
			NOW,
		);
		expect(deps.jobs[0]?.engine).toBe("claude");
		const none = await handle(
			extract({ engine: "auto", system: "", text: "", image: IMAGE }),
			depsWith(undefined, []),
			NOW,
		);
		expect(none.status).toBe(503);
		const off = await handle(
			extract({ engine: "codex", system: "", text: "", image: IMAGE }),
			depsWith(undefined, ["claude"]),
			NOW,
		);
		expect(off.status).toBe(503);
		expect(JSON.parse(off.body).error).toContain("--codex");
	});

	it("turns a runner failure into 502 with its message", async () => {
		const response = await handle(
			extract({ system: "", text: "", image: IMAGE }),
			depsWith({ run: () => Promise.reject(new Error("claude exited")) }),
			NOW,
		);
		expect(response.status).toBe(502);
		expect(JSON.parse(response.body).error).toBe("claude exited");
	});

	it("rejects bodies that are not a JPEG or PNG data URL", () => {
		expect(parseExtractBody("nope", ["claude"])).toMatchObject({
			status: 400,
		});
		expect(
			parseExtractBody(
				JSON.stringify({
					system: "",
					text: "",
					image: "data:image/gif;base64,AA==",
				}),
				["claude"],
			),
		).toMatchObject({ status: 400 });
		expect(
			parseExtractBody(
				JSON.stringify({ system: "", text: "", image: IMAGE, engine: "gpt" }),
				["claude"],
			),
		).toMatchObject({ status: 400 });
	});
});

describe("voyput-local job queue", () => {
	const job: ExtractJob = {
		engine: "claude",
		system: "read stamps",
		text: "Photo filename: a.jpg",
		image: { mediaType: "image/jpeg", data: Buffer.from("jpg") },
	};
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

	/** A runner whose runs finish only when released. */
	function held() {
		const release: (() => void)[] = [];
		let peak = 0;
		let running = 0;
		const runner: Runner = {
			run: async () => {
				running++;
				peak = Math.max(peak, running);
				await new Promise<void>((resolve) => release.push(resolve));
				running--;
				return "ok";
			},
		};
		return { runner, release, peak: () => peak };
	}

	it("runs at most the limit at once and reports busy when the line is full", async () => {
		const { runner, release, peak } = held();
		const limited = limitJobs(runner, 2, 1);
		const signal = new AbortController().signal;
		const deadline = Date.now() + 60_000;
		const all = Promise.all(
			[1, 2, 3].map(() => limited.run(job, signal, deadline)),
		);
		await tick();
		expect(release).toHaveLength(2);
		expect(limited.busy()).toBe(true);
		for (const done of release.splice(0)) done();
		await tick();
		expect(release).toHaveLength(1);
		release.shift()?.();
		expect(await all).toEqual(["ok", "ok", "ok"]);
		expect(peak()).toBe(2);
		expect(limited.busy()).toBe(false);
	});

	it("drops a waiting job when its client goes away or its deadline passes", async () => {
		const { runner, release } = held();
		const limited = limitJobs(runner, 1, 5);
		const open = new AbortController().signal;
		const first = limited.run(job, open, Date.now() + 60_000);
		const gone = new AbortController();
		const second = limited.run(job, gone.signal, Date.now() + 60_000);
		const late = limited.run(job, open, Date.now() + 5);
		gone.abort();
		await expect(second).rejects.toThrow("client went away");
		await expect(late).rejects.toThrow("deadline passed");
		await tick();
		release.shift()?.();
		expect(await first).toBe("ok");
		expect(release).toHaveLength(0);
	});
});

describe("voyput-local commands", () => {
	const job: ExtractJob = {
		engine: "codex",
		system: "read stamps",
		text: "Photo filename: a.jpg",
		image: { mediaType: "image/jpeg", data: Buffer.from("jpg") },
	};

	it("runs codex read-only without shell, image viewer or web search", () => {
		const command = codexCommand("/tmp/job", job);
		expect(command.args.slice(0, 3)).toEqual([
			"exec",
			"--sandbox",
			"read-only",
		]);
		const joined = command.args.join(" ");
		expect(joined).toContain("--disable shell_tool");
		expect(joined).toContain("--disable view_image");
		expect(joined).toContain('-c web_search="disabled"');
		expect(command.args).toContain("--ephemeral");
		expect(command.args.slice(-2)).toEqual(["--image", "/tmp/job/page.jpg"]);
		expect(command.stdin).toBe("read stamps\n\nPhoto filename: a.jpg");
		expect(command.answerFile).toBe("/tmp/job/answer.txt");
	});

	it("runs claude with no tools and the image inline", () => {
		const command = claudeCommand("/tmp/job", { ...job, engine: "claude" });
		const tools = command.args.indexOf("--tools");
		expect(command.args[tools + 1]).toBe("");
		expect(command.args).toContain("--no-session-persistence");
		const message = JSON.parse(command.stdin);
		expect(message.message.content[0].source).toEqual({
			type: "base64",
			media_type: "image/jpeg",
			data: Buffer.from("jpg").toString("base64"),
		});
		expect(message.message.content[1]).toEqual({
			type: "text",
			text: "Photo filename: a.jpg",
		});
	});

	it("gives the CLIs only the environment they need", () => {
		expect(
			childEnv({
				PATH: "/bin",
				HOME: "/home/u",
				CODEX_HOME: "/c",
				AWS_SECRET_ACCESS_KEY: "secret",
				GITHUB_TOKEN: "secret",
			}),
		).toEqual({ PATH: "/bin", HOME: "/home/u", CODEX_HOME: "/c" });
	});

	it("reads the result event of claude's stream", () => {
		const stdout = [
			'{"type":"system","subtype":"init"}',
			'{"type":"assistant"}',
			'{"type":"result","subtype":"success","is_error":false,"result":"{\\"stamps\\":[]}"}',
		].join("\n");
		expect(claudeAnswer(stdout)).toBe('{"stamps":[]}');
		expect(() =>
			claudeAnswer(
				'{"type":"result","subtype":"success","is_error":true,"result":"Not logged in"}',
			),
		).toThrow("Not logged in");
		expect(() => claudeAnswer("")).toThrow("no result");
	});

	it("finds programs on PATH", () => {
		const seen = new Set(["/opt/bin/codex"]);
		expect(
			findOnPath("codex", { PATH: "/usr/bin:/opt/bin" }, "linux", (p) =>
				seen.has(p),
			),
		).toBe("/opt/bin/codex");
		expect(
			findOnPath("claude", { PATH: "/usr/bin" }, "linux", () => false),
		).toBe(null);
	});

	it("names temp dirs by pid so a later start can remove a crashed run's", () => {
		expect(tempDirPid("voyput-local-4242-AbC123")).toBe(4242);
		expect(tempDirPid("voyput-local-AbC123")).toBe(null);
		expect(tempDirPid("other-4242-x")).toBe(null);
	});

	it("builds the pairing link, with the port only when it is not the default", () => {
		expect(pairingLink("abc", DEFAULT_PORT)).toBe(
			"https://voyput.app.offcall.link/settings#local=abc",
		);
		expect(pairingLink("abc", 5000)).toBe(
			"https://voyput.app.offcall.link/settings#local=abc&port=5000",
		);
	});
});
