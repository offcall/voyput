import { describe, expect, it } from "vitest";
import {
	claudeAnswer,
	claudeCommand,
	codexCommand,
	DEFAULT_PORT,
	type Deps,
	type ExtractJob,
	findOnPath,
	handle,
	isAllowedOrigin,
	limitJobs,
	type PlainRequest,
	pairingLink,
	parseExtractBody,
	type Runner,
} from "../src/voyput-local";

const TOKEN = "test-token-0123456789abcdef";
const IMAGE = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

function depsWith(
	runner: Runner = { run: async () => '{"stamps":[]}' },
	engines: Deps["engines"] = ["codex", "claude"],
): Deps & { jobs: ExtractJob[] } {
	const jobs: ExtractJob[] = [];
	return {
		token: TOKEN,
		port: DEFAULT_PORT,
		engines,
		jobs,
		runner: {
			run: (job) => {
				jobs.push(job);
				return runner.run(job);
			},
		},
	};
}

const request = (overrides: Partial<PlainRequest> = {}): PlainRequest => ({
	method: "GET",
	path: "/health",
	body: "",
	...overrides,
	headers: {
		host: `127.0.0.1:${DEFAULT_PORT}`,
		origin: "https://voyput.app.offcall.link",
		"x-voyput-token": TOKEN,
		...overrides.headers,
	},
});

const extract = (body: unknown, headers: PlainRequest["headers"] = {}) =>
	request({
		method: "POST",
		path: "/extract",
		body: JSON.stringify(body),
		headers,
	});

describe("voyput-local request handling", () => {
	it("reports its version and engines on /health with the right token", async () => {
		const response = await handle(request(), depsWith());
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toEqual({
			app: "voyput-local",
			version: "1",
			engines: ["codex", "claude"],
		});
		expect(response.headers["access-control-allow-origin"]).toBe(
			"https://voyput.app.offcall.link",
		);
	});

	it("answers 401 without the token or with a wrong one", async () => {
		const missing = await handle(
			request({ headers: { "x-voyput-token": undefined } }),
			depsWith(),
		);
		const wrong = await handle(
			request({ headers: { "x-voyput-token": "nope" } }),
			depsWith(),
		);
		expect(missing.status).toBe(401);
		expect(wrong.status).toBe(401);
		expect(wrong.body).not.toContain("codex");
	});

	it("refuses other origins and other hosts before checking anything else", async () => {
		const evil = await handle(
			request({ headers: { origin: "https://evil.example" } }),
			depsWith(),
		);
		expect(evil.status).toBe(403);
		expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
		const rebound = await handle(
			request({ headers: { host: "evil.example:47615" } }),
			depsWith(),
		);
		expect(rebound.status).toBe(403);
	});

	it("allows the site and localhost dev origins only", () => {
		expect(isAllowedOrigin("https://voyput.app.offcall.link")).toBe(true);
		expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
		expect(isAllowedOrigin("http://127.0.0.1:5180")).toBe(true);
		expect(isAllowedOrigin("http://voyput.app.offcall.link")).toBe(false);
		expect(isAllowedOrigin("https://localhost.evil.example")).toBe(false);
		expect(isAllowedOrigin("http://localhost:5173.evil.example")).toBe(false);
	});

	it("answers CORS and Private Network Access preflights without a token", async () => {
		const response = await handle(
			request({
				method: "OPTIONS",
				path: "/extract",
				headers: {
					"x-voyput-token": undefined,
					"access-control-request-private-network": "true",
				},
			}),
			depsWith(),
		);
		expect(response.status).toBe(204);
		expect(response.headers["access-control-allow-private-network"]).toBe(
			"true",
		);
		expect(response.headers["access-control-allow-headers"]).toContain(
			"x-voyput-token",
		);
	});

	it("runs the chosen engine and returns its text", async () => {
		const deps = depsWith();
		const response = await handle(
			extract({ engine: "claude", system: "sys", text: "photo", image: IMAGE }),
			deps,
		);
		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toEqual({
			text: '{"stamps":[]}',
			engine: "claude",
		});
		expect(deps.jobs[0]?.engine).toBe("claude");
		expect(deps.jobs[0]?.image.mediaType).toBe("image/png");
		expect(deps.jobs[0]?.image.data.toString()).toBe("png");
	});

	it("picks the first found engine for auto, and says when none is found", async () => {
		const deps = depsWith(undefined, ["claude"]);
		await handle(
			extract({ engine: "auto", system: "", text: "", image: IMAGE }),
			deps,
		);
		expect(deps.jobs[0]?.engine).toBe("claude");
		const none = await handle(
			extract({ engine: "auto", system: "", text: "", image: IMAGE }),
			depsWith(undefined, []),
		);
		expect(none.status).toBe(503);
		const missing = await handle(
			extract({ engine: "codex", system: "", text: "", image: IMAGE }),
			depsWith(undefined, ["claude"]),
		);
		expect(missing.status).toBe(503);
		expect(JSON.parse(missing.body).error).toContain("codex was not found");
	});

	it("turns a runner failure into 502 with its message", async () => {
		const response = await handle(
			extract({ system: "", text: "", image: IMAGE }),
			depsWith({ run: () => Promise.reject(new Error("codex exited")) }),
		);
		expect(response.status).toBe(502);
		expect(JSON.parse(response.body).error).toBe("codex exited");
	});

	it("rejects bodies that are not a JPEG or PNG data URL", () => {
		expect(parseExtractBody("nope", ["codex"])).toMatchObject({ status: 400 });
		expect(
			parseExtractBody(
				JSON.stringify({
					system: "",
					text: "",
					image: "data:image/gif;base64,AA==",
				}),
				["codex"],
			),
		).toMatchObject({ status: 400 });
		expect(
			parseExtractBody(
				JSON.stringify({ system: "", text: "", image: IMAGE, engine: "gpt" }),
				["codex"],
			),
		).toMatchObject({ status: 400 });
	});

	it("answers 404 for unknown paths", async () => {
		const response = await handle(request({ path: "/files" }), depsWith());
		expect(response.status).toBe(404);
	});
});

describe("voyput-local commands", () => {
	const job: ExtractJob = {
		engine: "codex",
		system: "read stamps",
		text: "Photo filename: a.jpg",
		image: { mediaType: "image/jpeg", data: Buffer.from("jpg") },
	};

	it("runs codex read-only with the image attached and the prompt on stdin", () => {
		const command = codexCommand("/tmp/job", job);
		expect(command.args.slice(0, 3)).toEqual([
			"exec",
			"--sandbox",
			"read-only",
		]);
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

	it("finds programs on PATH, with PATHEXT on Windows", () => {
		const seen = new Set(["/opt/bin/codex", "C:\\bin\\claude.CMD"]);
		expect(
			findOnPath("codex", { PATH: "/usr/bin:/opt/bin" }, "linux", (p) =>
				seen.has(p),
			),
		).toBe("/opt/bin/codex");
		expect(
			findOnPath("claude", { PATH: "/usr/bin" }, "linux", () => false),
		).toBe(null);
	});

	it("builds the pairing link, with the port only when it is not the default", () => {
		expect(pairingLink("abc", DEFAULT_PORT)).toBe(
			"https://voyput.app.offcall.link/settings#local=abc",
		);
		expect(pairingLink("abc", 5000)).toBe(
			"https://voyput.app.offcall.link/settings#local=abc&port=5000",
		);
	});

	it("runs at most the limit of jobs at once", async () => {
		let running = 0;
		let peak = 0;
		const release: (() => void)[] = [];
		const runner = limitJobs(
			{
				run: async () => {
					running++;
					peak = Math.max(peak, running);
					await new Promise<void>((resolve) => release.push(resolve));
					running--;
					return "ok";
				},
			},
			2,
		);
		const all = Promise.all([1, 2, 3].map(() => runner.run(job)));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(release).toHaveLength(2);
		for (const done of release.splice(0)) done();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(release).toHaveLength(1);
		release.shift()?.();
		expect(await all).toEqual(["ok", "ok", "ok"]);
		expect(peak).toBe(2);
	});
});
