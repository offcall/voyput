import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	admit,
	banner,
	byteBudget,
	childEnv,
	claudeAnswer,
	claudeCommand,
	cliRunner,
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
	outputCollector,
	pairingLink,
	parseExtractBody,
	parseSite,
	type Runner,
	readBody,
	refuse,
	requestAad,
	requestLines,
	reserveFrom,
	respond,
	responseAad,
	responseProof,
	runProcess,
	type Sealed,
	seal,
	sealKey,
	sha256Hex,
	tempDirPid,
	unseal,
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
	return { header: `v3.${now}.${nonce}.${bodyHash}.${mac}`, nonce };
}

function depsWith(
	runner: Runner = { run: async () => '{"stamps":[]}' },
	engines: Deps["engines"] = ["claude", "codex"],
	reserve?: Deps["reserve"],
): Deps & { jobs: ExtractJob[] } {
	const jobs: ExtractJob[] = [];
	const recording: Runner = {
		run: (job, signal, deadline) => {
			jobs.push(job);
			return runner.run(job, signal, deadline);
		},
	};
	return {
		token: TOKEN,
		port: DEFAULT_PORT,
		site: "https://voyput.app.offcall.link",
		engines,
		jobs,
		nonces: new NonceGuard(),
		reserve:
			reserve ??
			reserveFrom(limitJobs(recording, 3, 6), byteBudget(64 * 1024 * 1024)),
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

/** A POST /extract the way the app sends it: the JSON sealed, the header signed. */
function extract(value: unknown, { now = NOW, token = TOKEN } = {}) {
	const nonce = `nonce-${++nonceCount}-abcdefghijk`;
	const body = JSON.stringify(
		seal(
			sealKey(token),
			JSON.stringify(value),
			requestAad("POST", "/extract", String(now), nonce),
		),
	);
	return request("POST", "/extract", body, {}, { token, now, nonce });
}

/** The answer of an extract, opened with the request's nonce. */
const opened = (body: string, nonce: string) =>
	JSON.parse(
		unseal(sealKey(TOKEN), JSON.parse(body), responseAad(nonce)) ?? "null",
	);

describe("voyput-local authentication", () => {
	it("answers a signed /health with engines and a proof bound to the nonce", async () => {
		const req = request("GET", "/health");
		const response = await handle(req, depsWith(), NOW);
		expect(response.status).toBe(200);
		const body = JSON.parse(response.body);
		expect(body).toMatchObject({
			app: "voyput-local",
			version: "3",
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

	it("allows the --site origin instead of the public site", () => {
		const site = "https://voyput.example.org";
		expect(isAllowedOrigin(site, site)).toBe(true);
		expect(isAllowedOrigin("https://voyput.app.offcall.link", site)).toBe(
			false,
		);
		expect(isAllowedOrigin("http://localhost:5173", site)).toBe(true);
		const deps = { ...depsWith(), site };
		const health = (origin: string) =>
			admit(
				{
					method: "OPTIONS",
					path: "/health",
					headers: { host: BASE_HEADERS.host, origin },
				},
				deps,
				NOW,
			);
		const own = health(site);
		expect("response" in own && own.response.status).toBe(204);
		const other = health("https://voyput.app.offcall.link");
		expect("response" in other && other.response.status).toBe(403);
	});

	it("reads --site as an origin: https anywhere, http only on localhost", () => {
		expect(parseSite("https://voyput.example.org")).toBe(
			"https://voyput.example.org",
		);
		expect(parseSite("https://Voyput.Example.org/")).toBe(
			"https://voyput.example.org",
		);
		expect(parseSite("https://voyput.example.org:8443")).toBe(
			"https://voyput.example.org:8443",
		);
		expect(parseSite("http://localhost:5173")).toBe("http://localhost:5173");
		expect(parseSite("http://127.0.0.1:4173/")).toBe("http://127.0.0.1:4173");
		expect(parseSite("http://voyput.example.org")).toBe(null);
		expect(parseSite("https://voyput.example.org/app")).toBe(null);
		expect(parseSite("https://voyput.example.org/?x=1")).toBe(null);
		expect(parseSite("https://voyput.example.org/#x")).toBe(null);
		expect(parseSite("https://user@voyput.example.org")).toBe(null);
		expect(parseSite("voyput.example.org")).toBe(null);
		expect(parseSite("javascript:alert(1)")).toBe(null);
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

	it("shows a tokenless page at / to a person, not to other sites", () => {
		const page = admit(
			{ method: "GET", path: "/", headers: { host: BASE_HEADERS.host } },
			depsWith(),
			NOW,
		);
		if (!("response" in page)) throw new Error("expected a page");
		expect(page.response.status).toBe(200);
		expect(page.response.headers["content-type"]).toContain("text/html");
		expect(page.response.headers["content-security-policy"]).toContain(
			"default-src 'none'",
		);
		expect(page.response.body).toContain("voyput-local is running");
		expect(page.response.body).not.toContain(TOKEN);
		expect(page.response.body).toContain(
			'href="https://voyput.app.offcall.link/settings"',
		);
		const own = admit(
			{ method: "GET", path: "/", headers: { host: BASE_HEADERS.host } },
			{ ...depsWith(), site: "https://voyput.example.org" },
			NOW,
		);
		expect("response" in own && own.response.body).toContain(
			'href="https://voyput.example.org/settings"',
		);
		expect(statusOf(request("GET", "/"))).toBe(404);
		const rebound = admit(
			{ method: "GET", path: "/", headers: { host: "evil.example" } },
			depsWith(),
			NOW,
		);
		expect("response" in rebound && rebound.response.status).toBe(403);
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
				depsWith(undefined, undefined, () => null),
			),
		).toBe(503);
		expect(statusOf(request("POST", "/extract", "{}"))).toBe("admitted");
	});
});

describe("voyput-local extraction", () => {
	it("decrypts the sealed photo, runs the engine and seals the answer", async () => {
		const deps = depsWith();
		const req = extract({
			engine: "claude",
			system: "sys",
			text: "photo",
			image: IMAGE,
		});
		const response = await handle(req, deps, NOW);
		expect(response.status).toBe(200);
		expect(response.body).not.toContain("stamps");
		expect(opened(response.body, req.nonce)).toEqual({
			text: '{"stamps":[]}',
			engine: "claude",
		});
		expect(req.body).not.toContain(IMAGE.slice(-8));
		expect(req.body).not.toContain("photo");
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
		expect(JSON.parse(off.body).error).toContain("--no-codex");
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
	const open = () => new AbortController().signal;
	const later = () => Date.now() + 60_000;

	/** A runner whose runs finish only when released. */
	function held() {
		const release: (() => void)[] = [];
		let peak = 0;
		let running = 0;
		let started = 0;
		const runner: Runner = {
			run: async () => {
				started++;
				running++;
				peak = Math.max(peak, running);
				await new Promise<void>((resolve) => release.push(resolve));
				running--;
				return "ok";
			},
		};
		return { runner, release, peak: () => peak, started: () => started };
	}

	it("runs at most the limit at once and never holds more than limit + waiting places", async () => {
		const { runner, release, peak } = held();
		const line = limitJobs(runner, 2, 1);
		const slots = [line.reserve(), line.reserve(), line.reserve()];
		expect(line.reserve()).toBeNull();
		const all = Promise.all(
			slots.map((slot) => slot?.run(job, open(), later())),
		);
		await tick();
		expect(release).toHaveLength(2);
		for (const done of release.splice(0)) done();
		await tick();
		expect(release).toHaveLength(1);
		release.shift()?.();
		expect(await all).toEqual(["ok", "ok", "ok"]);
		expect(peak()).toBe(2);
		expect(line.reserve()).toBeNull();
		for (const slot of slots) slot?.release();
		expect(line.reserve()).not.toBeNull();
	});

	it("admits overlapping uploads only up to capacity, and frees room only when an answer is sent", async () => {
		const { runner, release } = held();
		const deps = depsWith(runner, ["claude"], undefined);
		deps.reserve = reserveFrom(limitJobs(runner, 1, 1), byteBudget(1 << 20));
		const body = { system: "", text: "", image: IMAGE };
		// Three uploads arrive before any body is read: two fit, the third does not.
		const first = extract(body);
		const second = extract(body);
		const third = extract(body);
		const a = admit(first, deps, NOW);
		const b = admit(second, deps, NOW);
		const c = admit(third, deps, NOW);
		expect("slot" in a && "slot" in b).toBe(true);
		expect("response" in c && c.response.status).toBe(503);
		if (!("slot" in a) || !("slot" in b)) throw new Error("expected slots");
		// Both bodies arrive later; the line still holds two, never three.
		const answers = [
			respond(first, a, deps, open(), later()),
			respond(second, b, deps, open(), later()),
		];
		await tick();
		expect(release).toHaveLength(1);
		expect("response" in admit(extract(body), deps, NOW)).toBe(true);
		release.shift()?.();
		await answers[0];
		// The finished job's slot is still held until its answer is sent.
		expect("response" in admit(extract(body), deps, NOW)).toBe(true);
		a.slot?.release();
		const d = admit(extract(body), deps, NOW);
		expect("slot" in d).toBe(true);
		await tick();
		release.shift()?.();
		await answers[1];
		b.slot?.release();
		if ("slot" in d) d.slot?.release();
	});

	it("keeps body bytes reserved until release and refuses uploads past the budget", () => {
		const budget = byteBudget(100);
		const reserve = reserveFrom(limitJobs(held().runner, 5, 5), budget);
		const big = reserve(80);
		expect(big).not.toBeNull();
		expect(reserve(30)).toBeNull();
		expect(budget.used()).toBe(80);
		big?.release();
		big?.release();
		expect(budget.used()).toBe(0);
		expect(reserve(30)).not.toBeNull();
	});

	it("gives back the bytes when the line has no place", () => {
		const budget = byteBudget(100);
		const line = limitJobs(held().runner, 1, 0);
		const reserve = reserveFrom(line, budget);
		expect(reserve(10)).not.toBeNull();
		expect(reserve(10)).toBeNull();
		expect(budget.used()).toBe(10);
	});

	it("drops a waiting job when its client goes away or its deadline passes", async () => {
		const { runner, release } = held();
		const line = limitJobs(runner, 1, 5);
		const first = line.reserve()?.run(job, open(), later());
		const gone = new AbortController();
		const second = line.reserve()?.run(job, gone.signal, later());
		const late = line.reserve()?.run(job, open(), Date.now() + 5);
		gone.abort();
		await expect(second).rejects.toThrow("client went away");
		await expect(late).rejects.toThrow("deadline passed");
		await tick();
		release.shift()?.();
		expect(await first).toBe("ok");
		expect(release).toHaveLength(0);
	});

	it("on close rejects waiting jobs, starts none, and reports idle once running ones end", async () => {
		const { runner, release, started } = held();
		const line = limitJobs(runner, 1, 5);
		const running = line.reserve()?.run(job, open(), later());
		const waiting = [1, 2].map(() => line.reserve()?.run(job, open(), later()));
		await tick();
		expect(started()).toBe(1);
		line.close();
		for (const queued of waiting)
			await expect(queued).rejects.toThrow("shutting down");
		expect(line.reserve()).toBeNull();
		let idle = false;
		const settled = line.idle().then(() => {
			idle = true;
		});
		await tick();
		expect(idle).toBe(false);
		release.shift()?.();
		expect(await running).toBe("ok");
		await settled;
		expect(idle).toBe(true);
		await tick();
		expect(started()).toBe(1);
	});
});

describe("voyput-local deadlines", () => {
	const job: ExtractJob = {
		engine: "claude",
		system: "",
		text: "",
		image: { mediaType: "image/jpeg", data: Buffer.from("jpg") },
	};
	const open = () => new AbortController().signal;

	it("stops reading an upload that is still arriving at the deadline", async () => {
		const upload = new PassThrough();
		upload.write('{"iv":');
		const result = await readBody(upload, 1000, Date.now() + 20);
		expect(result).toEqual({
			status: 408,
			error: "upload did not finish in time",
		});
		expect(upload.destroyed).toBe(true);
	});

	it("reads a complete upload and refuses one longer than declared", async () => {
		const ok = new PassThrough();
		const reading = readBody(ok, 4, Date.now() + 60_000);
		ok.end("abcd");
		expect(await reading).toEqual({ body: "abcd" });
		const long = new PassThrough();
		const refused = readBody(long, 2, Date.now() + 60_000);
		long.write("abc");
		expect(await refused).toMatchObject({ status: 413 });
	});

	it("answers a refused upload and closes the connection without reading the body", async () => {
		let received = 0;
		const server = createServer((request, response) => {
			request.on("data", (chunk: Buffer) => {
				received += chunk.length;
			});
			refuse(request, response, {
				status: 403,
				headers: { "content-type": "application/json" },
				body: '{"error":"wrong origin"}',
			});
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		try {
			const { port } = server.address() as AddressInfo;
			const socket = connect(port, "127.0.0.1");
			let reply = "";
			socket.on("data", (chunk: Buffer) => {
				reply += chunk.toString();
			});
			socket.on("error", () => {});
			const closed = new Promise<void>((resolve) =>
				socket.on("close", () => resolve()),
			);
			socket.write(
				`POST /extract HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: ${MAX_BODY_BYTES}\r\n\r\n`,
			);
			socket.write(Buffer.alloc(1024));
			// The upload never finishes: only a server that drops it lets the socket close.
			await closed;
			expect(reply).toMatch(/^HTTP\/1\.1 403/);
			expect(reply.toLowerCase()).toContain("connection: close");
			expect(received).toBeLessThan(MAX_BODY_BYTES);
		} finally {
			server.close();
		}
	});

	it("never starts a job whose deadline passed while it waited", async () => {
		let clock = 1_000;
		const release: (() => void)[] = [];
		let started = 0;
		const line = limitJobs(
			{
				run: async () => {
					started++;
					await new Promise<void>((resolve) => release.push(resolve));
					return "ok";
				},
			},
			1,
			5,
			() => clock,
		);
		const first = line.reserve()?.run(job, open(), 61_000);
		// Its timer is set for a minute of fake time, so only the clock moves.
		const second = line.reserve()?.run(job, open(), 2_000);
		await new Promise((resolve) => setTimeout(resolve, 0));
		clock = 5_000;
		release.shift()?.();
		expect(await first).toBe("ok");
		await expect(second).rejects.toThrow("deadline passed");
		expect(started).toBe(1);
		await expect(line.reserve()?.run(job, open(), 4_000)).rejects.toThrow(
			"deadline passed before the job could start",
		);
		expect(started).toBe(1);
	});

	it("keeps a UTF-8 character whole when a pipe splits it across chunks", () => {
		const bytes = Buffer.from("Türkiye → Москва", "utf8");
		const split = bytes.indexOf(Buffer.from("→", "utf8")) + 1;
		const output = outputCollector(1024);
		output.add(bytes.subarray(0, split));
		output.add(bytes.subarray(split));
		expect(output.text()).toBe("Türkiye → Москва");
	});

	it("caps CLI output in bytes, not UTF-16 units", () => {
		const output = outputCollector(4);
		output.add(Buffer.from("ёё", "utf8"));
		output.add(Buffer.from("ё", "utf8"));
		expect(output.text()).toBe("ёё");
	});

	it("does not queue a job whose client already went away", async () => {
		const release: (() => void)[] = [];
		let started = 0;
		const line = limitJobs(
			{
				run: async () => {
					started++;
					await new Promise<void>((resolve) => release.push(resolve));
					return "ok";
				},
			},
			1,
			1,
		);
		const first = line.reserve()?.run(job, open(), Date.now() + 60_000);
		const gone = new AbortController();
		gone.abort();
		const slot = line.reserve();
		// Rejected at once, while the only run is still busy.
		await expect(
			slot?.run(job, gone.signal, Date.now() + 60_000),
		).rejects.toThrow("client went away");
		slot?.release();
		expect(line.reserve()).not.toBeNull();
		release.shift()?.();
		expect(await first).toBe("ok");
		expect(started).toBe(1);
	});

	it("does not spawn a CLI for a client that already went away", async () => {
		const gone = new AbortController();
		gone.abort();
		await expect(
			runProcess(
				"/nonexistent/claude",
				{ program: "claude", args: [], stdin: "", answerFile: null },
				tmpdir(),
				gone.signal,
				Date.now() + 60_000,
			),
		).rejects.toThrow("client went away before the CLI could start");
	});

	it("does not spawn a CLI after the deadline", async () => {
		await expect(
			runProcess(
				"/nonexistent/claude",
				{ program: "claude", args: [], stdin: "", answerFile: null },
				tmpdir(),
				open(),
				Date.now() - 1,
			),
		).rejects.toThrow("deadline passed before the CLI could start");
	});
});

describe.skipIf(process.platform === "win32")(
	"voyput-local CLI processes",
	() => {
		/** Running, not merely a zombie waiting to be reaped (Linux /proc when present). */
		const running = (pid: number) => {
			try {
				process.kill(pid, 0);
			} catch {
				return false;
			}
			try {
				const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
				return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
			} catch {
				return true;
			}
		};
		/** Whether `pid` has stopped running within a short wait for the kill to land. */
		const isAlive = async (pid: number) => {
			for (let tries = 0; tries < 40 && running(pid); tries++)
				await new Promise((resolve) => setTimeout(resolve, 50));
			return running(pid);
		};

		/** A fake CLI script; its background `sleep` inherits stdout and stderr. */
		async function fakeCli(body: string) {
			const dir = await mkdtemp(join(tmpdir(), "vl-fake-cli-"));
			const path = join(dir, "claude");
			await writeFile(path, `#!/bin/sh\n${body}\n`);
			await chmod(path, 0o755);
			const descendant = () =>
				Number(readFileSync(join(dir, "descendant.pid"), "utf8"));
			return { dir, path, descendant };
		}
		const command = {
			program: "claude" as const,
			args: [],
			stdin: "",
			answerFile: null,
		};

		it("settles and kills the descendant when the CLI exits but a descendant holds its pipes", async () => {
			const cli = await fakeCli(
				'sleep 30 &\necho $! > "$(dirname "$0")/descendant.pid"\necho answer\nexit 0',
			);
			try {
				const started = Date.now();
				const out = await runProcess(
					cli.path,
					command,
					cli.dir,
					new AbortController().signal,
					Date.now() + 60_000,
					200,
				);
				expect(out).toBe("answer\n");
				expect(Date.now() - started).toBeLessThan(5_000);
				expect(await isAlive(cli.descendant())).toBe(false);
			} finally {
				await rm(cli.dir, { recursive: true, force: true });
			}
		});

		it("settles and kills the whole tree on cancel, even with pipes held open", async () => {
			const cli = await fakeCli(
				'sleep 30 &\necho $! > "$(dirname "$0")/descendant.pid"\nsleep 30',
			);
			try {
				const controller = new AbortController();
				const running = runProcess(
					cli.path,
					command,
					cli.dir,
					controller.signal,
					Date.now() + 60_000,
					200,
				);
				await new Promise((resolve) => setTimeout(resolve, 300));
				controller.abort();
				await expect(running).rejects.toThrow("cancelled");
				expect(await isAlive(cli.descendant())).toBe(false);
			} finally {
				await rm(cli.dir, { recursive: true, force: true });
			}
		});

		const claudeJob: ExtractJob = {
			engine: "claude",
			system: "read stamps",
			text: "",
			image: { mediaType: "image/jpeg", data: Buffer.from("jpg") },
		};
		/** A temp dir delete that fails like EBUSY on Windows, then cleans up for the test. */
		function failingRemove() {
			const dirs: string[] = [];
			const remove = async (dir: string) => {
				dirs.push(dir);
				await rm(dir, { recursive: true, force: true });
				throw Object.assign(new Error("EBUSY: resource busy"), {
					code: "EBUSY",
				});
			};
			return { dirs, remove };
		}

		it("keeps the answer and logs when deleting the temp dir fails", async () => {
			const result = JSON.stringify({
				type: "result",
				subtype: "success",
				result: "answer",
			});
			const cli = await fakeCli(`cat > /dev/null\necho '${result}'`);
			const log = vi
				.spyOn(process.stderr, "write")
				.mockImplementation(() => true);
			const { dirs, remove } = failingRemove();
			try {
				const runner = cliRunner({ claude: cli.path }, remove);
				await expect(
					runner.run(
						claudeJob,
						new AbortController().signal,
						Date.now() + 60_000,
					),
				).resolves.toBe("answer");
				expect(dirs).toHaveLength(1);
				expect(String(log.mock.calls[0]?.[0])).toContain("could not delete");
			} finally {
				log.mockRestore();
				await rm(cli.dir, { recursive: true, force: true });
			}
		});

		it("keeps the job's own error when deleting the temp dir fails", async () => {
			const log = vi
				.spyOn(process.stderr, "write")
				.mockImplementation(() => true);
			const { dirs, remove } = failingRemove();
			try {
				const runner = cliRunner({ claude: "/nonexistent/claude" }, remove);
				await expect(
					runner.run(
						claudeJob,
						new AbortController().signal,
						Date.now() + 60_000,
					),
				).rejects.toThrow("ENOENT");
				expect(dirs).toHaveLength(1);
			} finally {
				log.mockRestore();
			}
		});

		it("settles at the deadline when the leader is gone and a descendant holds the pipes", async () => {
			const cli = await fakeCli(
				'(sleep 30; echo late) &\necho $! > "$(dirname "$0")/descendant.pid"\nkill -9 $$',
			);
			try {
				const started = Date.now();
				await expect(
					runProcess(
						cli.path,
						command,
						cli.dir,
						new AbortController().signal,
						Date.now() + 500,
						200,
					),
				).rejects.toThrow();
				expect(Date.now() - started).toBeLessThan(5_000);
				expect(await isAlive(cli.descendant())).toBe(false);
			} finally {
				await rm(cli.dir, { recursive: true, force: true });
			}
		});
	},
);

describe("voyput-local encryption", () => {
	const key = sealKey(TOKEN);

	it("opens only with the same key and the same associated data", () => {
		const sealed: Sealed = seal(key, "secret page", "aad-1");
		expect(unseal(key, sealed, "aad-1")).toBe("secret page");
		expect(unseal(key, sealed, "aad-2")).toBeNull();
		expect(unseal(sealKey("other-token-0123456789"), sealed, "aad-1")).toBe(
			null,
		);
		const flipped = Buffer.from(sealed.data, "base64");
		flipped[0] = (flipped[0] ?? 0) ^ 1;
		expect(
			unseal(key, { ...sealed, data: flipped.toString("base64") }, "aad-1"),
		).toBeNull();
		expect(unseal(key, { iv: "x" }, "aad-1")).toBeNull();
	});

	it("refuses an extract body sealed for another request", async () => {
		const req = extract({ system: "", text: "", image: IMAGE });
		const other = extract({ system: "", text: "", image: IMAGE });
		const response = await handle(
			{
				...other,
				body: req.body,
				headers: {
					...other.headers,
					"x-voyput-auth": sign("POST", "/extract", req.body).header,
				},
			},
			depsWith(),
			NOW,
		);
		expect(response.status).toBe(400);
		expect(JSON.parse(response.body).error).toBe("body could not be decrypted");
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
		expect(pairingLink("abc", 5000, "https://voyput.example.org")).toBe(
			"https://voyput.example.org/settings#local=abc&port=5000",
		);
	});
});

describe("voyput-local banner", () => {
	const info = {
		port: DEFAULT_PORT,
		token: TOKEN,
		engines: { claude: "ready", codex: "ready" },
	} as const;

	it("puts the pairing link first and lists both engines", () => {
		const text = banner(info, false);
		expect(text.indexOf(pairingLink(TOKEN, DEFAULT_PORT))).toBeLessThan(
			text.indexOf("Engines"),
		);
		expect(text).toContain("● Claude Code   ● Codex");
		expect(text).toContain("ready");
		expect(text).not.toContain("\x1b[");
	});

	it("says why an engine is missing and colours only on request", () => {
		const text = banner(
			{ ...info, engines: { claude: "missing", codex: "off" } },
			false,
		);
		expect(text).toContain("Claude Code (not installed)");
		expect(text).toContain("Codex (off: --no-codex)");
		expect(text).toContain("no engine");
		expect(banner(info, true)).toContain("\x1b[");
	});

	it("pairs with the --site origin when one is given", () => {
		const text = banner({ ...info, site: "https://voyput.example.org" }, false);
		expect(text).toContain(
			pairingLink(TOKEN, DEFAULT_PORT, "https://voyput.example.org"),
		);
		expect(text).not.toContain("offcall.link");
	});
});
