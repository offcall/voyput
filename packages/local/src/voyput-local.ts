/**
 * voyput-local: reads passport stamps for the voyput app with the Claude Code
 * or Codex CLI already installed and logged in here.
 *
 * One file, Node >= 22.12 built-ins only. The site serves it as JavaScript
 * (types stripped at build time); from a clone, run this .ts file with
 * `node --experimental-strip-types`.
 *
 *   node voyput-local.mjs [--port 47615] [--site <origin>] [--no-codex] [--new-token]
 *
 * It listens on 127.0.0.1 only. The pairing token it prints never travels:
 * each request carries an HMAC made with it, the photo and the answer are
 * encrypted with AES-256-GCM under a key derived from it, and /health proves
 * the server knows it. The image goes to the CLI's own provider (Anthropic or
 * OpenAI) under your account; nothing goes to voyput.
 * See docs/adr/0026-local-ai-engine.md.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	hkdfSync,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const VERSION = "3";
export const DEFAULT_PORT = 47615;
/** The public site; a copy on another domain passes `--site <origin>`. */
export const SITE_ORIGIN = "https://voyput.app.offcall.link";
export const AUTH_HEADER = "x-voyput-auth";
export const MAX_BODY_BYTES = 30 * 1024 * 1024;
/** Bytes of request bodies held at once, from admission until the answer is sent. */
export const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
/** From the request's arrival to the answer, queue time included. */
export const JOB_DEADLINE_MS = 10 * 60_000;
/** CLI runs at once; matches the app's Extract concurrency (3). */
export const MAX_JOBS = 3;
/** Admitted requests beyond the running ones (uploading or waiting); more get 503. */
export const MAX_WAITING = 6;
/** How far a request's timestamp may be from this clock. */
export const MAX_SKEW_MS = 60_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** After the CLI exits (or is killed), how long to wait for its pipes to close. */
export const PIPE_GRACE_MS = 2_000;
const TEMP_PREFIX = "voyput-local-";

export type Engine = "codex" | "claude";
/** "auto" order: Claude Code runs with no tools at all, so it comes first. */
export const ENGINES: readonly Engine[] = ["claude", "codex"];
export type MediaType = "image/jpeg" | "image/png";

export interface ExtractJob {
	engine: Engine;
	system: string;
	text: string;
	image: { mediaType: MediaType; data: Buffer };
}

/** Runs one job through a CLI and returns the model's final text. */
export interface Runner {
	run(job: ExtractJob, signal: AbortSignal, deadline: number): Promise<string>;
}

/** Remembers request nonces until their timestamp is too old to be accepted. */
export class NonceGuard {
	private readonly seen = new Map<string, number>();
	/** False when the nonce was already used. */
	use(nonce: string, now: number): boolean {
		for (const [key, expires] of this.seen)
			if (expires < now) this.seen.delete(key);
		if (this.seen.has(nonce)) return false;
		this.seen.set(nonce, now + 2 * MAX_SKEW_MS);
		return true;
	}
}

/**
 * Room for one admitted request: a place in the job line and its body bytes,
 * held from admission until `release()` after the answer is sent.
 */
export interface Slot {
	/** Runs the job once, waiting in line when every run is busy. */
	run(job: ExtractJob, signal: AbortSignal, deadline: number): Promise<string>;
	release(): void;
}

export interface Deps {
	token: string;
	port: number;
	/** The site origin allowed besides localhost (`--site`). */
	site: string;
	/** Engines that may run, in "auto" order. */
	engines: readonly Engine[];
	nonces: NonceGuard;
	/** Reserves room for a POST of `bytes`, or null when there is none. */
	reserve: (bytes: number) => Slot | null;
}

export interface HeadRequest {
	method: string;
	path: string;
	headers: Record<string, string | undefined>;
}

export interface PlainResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
}

/** A request whose headers passed every check; its body is still unread. */
export interface Admitted {
	nonce: string;
	timestamp: string;
	bodyHash: string;
	cors: Record<string, string>;
	/** Held for a POST; the caller releases it once the answer is sent. */
	slot: Slot | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

export const sha256Hex = (data: string | Buffer) =>
	createHash("sha256").update(data).digest("hex");

const hmac = (token: string, lines: readonly string[]) =>
	createHmac("sha256", token).update(lines.join("\n")).digest("base64url");

/** What the app signs for each request (same text in `apps/web/src/ai/localAuth.ts`). */
export const requestLines = (
	method: string,
	path: string,
	timestamp: string,
	nonce: string,
	bodyHash: string,
) => ["voyput-local/3 request", method, path, timestamp, nonce, bodyHash];

/** Proof that this server knows the token, bound to the request nonce. */
export const responseProof = (token: string, nonce: string, content: string) =>
	hmac(token, ["voyput-local/3 response", nonce, sha256Hex(content)]);

/** The AES-256-GCM key both sides derive from the token (HKDF-SHA256). */
export const sealKey = (token: string): Buffer =>
	Buffer.from(hkdfSync("sha256", token, "voyput-local/3", "aes-256-gcm", 32));

/** Associated data that binds an encrypted request to its signed header. */
export const requestAad = (
	method: string,
	path: string,
	timestamp: string,
	nonce: string,
) => ["voyput-local/3 request", method, path, timestamp, nonce].join("\n");

/** Associated data that binds an encrypted answer to its request. */
export const responseAad = (nonce: string) =>
	["voyput-local/3 response", nonce].join("\n");

/** An AES-256-GCM message: 12-byte IV and ciphertext with its 16-byte tag, base64. */
export interface Sealed {
	iv: string;
	data: string;
}

export function seal(key: Buffer, plaintext: string, aad: string): Sealed {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	cipher.setAAD(Buffer.from(aad));
	const data = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
		cipher.getAuthTag(),
	]);
	return { iv: iv.toString("base64"), data: data.toString("base64") };
}

/** The plaintext, or null when the message is malformed, forged or bound to other data. */
export function unseal(
	key: Buffer,
	value: unknown,
	aad: string,
): string | null {
	if (
		!isObject(value) ||
		typeof value.iv !== "string" ||
		typeof value.data !== "string"
	)
		return null;
	const iv = Buffer.from(value.iv, "base64");
	const data = Buffer.from(value.data, "base64");
	if (iv.length !== 12 || data.length < 16) return null;
	try {
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAAD(Buffer.from(aad));
		decipher.setAuthTag(data.subarray(data.length - 16));
		return Buffer.concat([
			decipher.update(data.subarray(0, data.length - 16)),
			decipher.final(),
		]).toString("utf8");
	} catch {
		return null;
	}
}

/**
 * A `--site` value as an origin: https on any host, or http on localhost or
 * 127.0.0.1. A trailing slash is dropped; a path, query, fragment or
 * credentials make it invalid (null).
 */
export function parseSite(value: string): string | null {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
		return null;
	if (url.username || url.password || url.search || url.hash) return null;
	if (url.pathname !== "/") return null;
	return url.origin;
}

/** The site (`--site`, default the public one), and any localhost port for a dev server or a clone. */
export function isAllowedOrigin(origin: string, site = SITE_ORIGIN): boolean {
	if (origin === site) return true;
	return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** Rejects DNS-rebinding: the Host must name this machine's loopback. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
	return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

const safeEqual = (a: string, b: string) => {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
};

const AUTH =
	/^v3\.(\d{1,16})\.([A-Za-z0-9_-]{16,64})\.([0-9a-f]{64})\.([A-Za-z0-9_-]{43})$/;

/** Checks an `x-voyput-auth` header: format, age, MAC, then marks the nonce used. */
export function verifyAuth(
	header: string | undefined,
	method: string,
	path: string,
	deps: Pick<Deps, "token" | "nonces">,
	now: number,
): { nonce: string; timestamp: string; bodyHash: string } | null {
	const match = header ? AUTH.exec(header) : null;
	if (!match) return null;
	const [, timestamp = "", nonce = "", bodyHash = "", mac = ""] = match;
	if (Math.abs(now - Number(timestamp)) > MAX_SKEW_MS) return null;
	const expected = hmac(
		deps.token,
		requestLines(method, path, timestamp, nonce, bodyHash),
	);
	if (!safeEqual(expected, mac)) return null;
	if (!deps.nonces.use(nonce, now)) return null;
	return { nonce, timestamp, bodyHash };
}

const json = (
	status: number,
	value: unknown,
	headers: Record<string, string> = {},
): PlainResponse => ({
	status,
	headers: { ...headers, "content-type": "application/json" },
	body: JSON.stringify(value),
});

const corsHeaders = (origin: string | undefined): Record<string, string> =>
	origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {};

const ROUTES = new Set(["GET /health", "POST /extract"]);

/**
 * What a person who opens the server's address in a browser sees: a pointer
 * back to the app. It holds no token and loads nothing.
 */
const homePageHtml = (site: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>voyput-local</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1d1d1f}h1{font-size:1.4rem}code{background:#f2f2f2;padding:.1em .3em;border-radius:4px}a{color:#0a66c2}</style>
</head><body>
<h1>voyput-local is running</h1>
<p>This is the local helper that lets voyput read passport stamps with your Claude Code or Codex subscription. It has no page of its own.</p>
<p>To pair, open the <b>pairing link</b> printed in your terminal, or paste the token there into <a href="${site}/settings">voyput → Settings → AI → Local</a>.</p>
</body></html>
`;

const homePage = (site: string): PlainResponse => ({
	status: 200,
	headers: {
		"content-type": "text/html; charset=utf-8",
		"content-security-policy":
			"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
		"x-frame-options": "DENY",
		"referrer-policy": "no-referrer",
	},
	body: homePageHtml(site),
});

/**
 * Everything decided from the headers alone, before any body byte is read:
 * host, origin, preflight, route, MAC, replay, size, and a reserved slot
 * (queue place and body bytes) that the caller must release.
 */
export function admit(
	request: HeadRequest,
	deps: Deps,
	now: number,
): { response: PlainResponse } | Admitted {
	const { headers } = request;
	if (!isAllowedHost(headers.host, deps.port))
		return { response: json(403, { error: "wrong host" }) };
	const origin = headers.origin;
	if (origin !== undefined && !isAllowedOrigin(origin, deps.site))
		return { response: json(403, { error: "origin not allowed" }) };
	const cors = corsHeaders(origin);

	if (request.method === "OPTIONS") {
		const preflight: Record<string, string> = {
			...cors,
			"access-control-allow-methods": "GET, POST",
			"access-control-allow-headers": `content-type, ${AUTH_HEADER}`,
			"access-control-max-age": "600",
		};
		// Private Network Access preflight (Chromium).
		if (headers["access-control-request-private-network"] === "true")
			preflight["access-control-allow-private-network"] = "true";
		return { response: { status: 204, headers: preflight, body: "" } };
	}
	if (request.method === "GET" && request.path === "/" && origin === undefined)
		return { response: homePage(deps.site) };
	if (!ROUTES.has(`${request.method} ${request.path}`))
		return { response: json(404, { error: "not found" }, cors) };

	const auth = verifyAuth(
		headers[AUTH_HEADER],
		request.method,
		request.path,
		deps,
		now,
	);
	if (!auth)
		return {
			response: json(401, { error: "not signed with the pairing token" }, cors),
		};

	if (request.method === "POST") {
		const length = Number(headers["content-length"]);
		if (!Number.isInteger(length) || length < 0)
			return { response: json(411, { error: "content-length needed" }, cors) };
		if (length > MAX_BODY_BYTES)
			return { response: json(413, { error: "body too large" }, cors) };
		const slot = deps.reserve(length);
		if (!slot)
			return {
				response: json(503, { error: "busy: too many photos waiting" }, cors),
			};
		return { ...auth, cors, slot };
	}
	return { ...auth, cors, slot: null };
}

const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

/** Validates a decrypted POST /extract body. */
export function parseExtractBody(
	body: string,
	engines: readonly Engine[],
): { job: ExtractJob } | { status: number; error: string } {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return { status: 400, error: "body is not JSON" };
	}
	if (!isObject(value)) return { status: 400, error: "body is not an object" };
	const { engine, system, text, image } = value;
	if (typeof system !== "string" || typeof text !== "string")
		return { status: 400, error: "system and text must be strings" };
	if (typeof image !== "string")
		return { status: 400, error: "image must be a data URL" };
	const match = DATA_URL.exec(image);
	if (!match?.[1] || !match[2])
		return { status: 400, error: "image must be a JPEG or PNG data URL" };
	const wanted = engine ?? "auto";
	let chosen: Engine | undefined;
	if (wanted === "auto") chosen = engines[0];
	else if (wanted === "codex" || wanted === "claude")
		chosen = engines.includes(wanted) ? wanted : undefined;
	else return { status: 400, error: "engine must be auto, codex or claude" };
	if (!chosen)
		return {
			status: 503,
			error:
				wanted === "auto"
					? "no engine found: install Claude Code or Codex CLI, log in and restart voyput-local"
					: wanted === "codex"
						? "Codex is off: it was not found on PATH when voyput-local started, or it was started with --no-codex"
						: "claude was not found on PATH when voyput-local started",
		};
	return {
		job: {
			engine: chosen,
			system,
			text,
			image: {
				mediaType: match[1] as MediaType,
				data: Buffer.from(match[2], "base64"),
			},
		},
	};
}

/** Answers an admitted request once its body is read. */
export async function respond(
	request: HeadRequest & { body: string },
	admitted: Admitted,
	deps: Deps,
	signal: AbortSignal,
	deadline: number,
): Promise<PlainResponse> {
	const { cors, nonce, timestamp } = admitted;
	if (sha256Hex(request.body) !== admitted.bodyHash)
		return json(400, { error: "body does not match its signature" }, cors);
	if (request.path === "/health")
		return json(
			200,
			{
				app: "voyput-local",
				version: VERSION,
				engines: deps.engines,
				maxJobs: MAX_JOBS,
				proof: responseProof(deps.token, nonce, "health"),
			},
			cors,
		);
	if (!admitted.slot) return json(500, { error: "no slot reserved" }, cors);
	const key = sealKey(deps.token);
	let sealed: unknown = null;
	try {
		sealed = JSON.parse(request.body);
	} catch {}
	const plaintext = unseal(
		key,
		sealed,
		requestAad(request.method, request.path, timestamp, nonce),
	);
	if (plaintext === null)
		return json(400, { error: "body could not be decrypted" }, cors);
	const parsed = parseExtractBody(plaintext, deps.engines);
	if ("error" in parsed)
		return json(parsed.status, { error: parsed.error }, cors);
	const { engine } = parsed.job;
	try {
		const text = await admitted.slot.run(parsed.job, signal, deadline);
		return json(
			200,
			seal(key, JSON.stringify({ text, engine }), responseAad(nonce)),
			cors,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return json(502, { error: message, engine }, cors);
	}
}

/** `admit`, `respond`, then release the slot, for callers that already hold the body. */
export async function handle(
	request: HeadRequest & { body: string },
	deps: Deps,
	now: number,
	signal: AbortSignal = new AbortController().signal,
): Promise<PlainResponse> {
	const admitted = admit(request, deps, now);
	if ("response" in admitted) return admitted.response;
	try {
		return await respond(
			request,
			admitted,
			deps,
			signal,
			now + JOB_DEADLINE_MS,
		);
	} finally {
		admitted.slot?.release();
	}
}

const aborted = (reason: string) =>
	Object.assign(new Error(reason), { name: "AbortError" });

/** The job line: reservations, waiting jobs and running jobs. */
export interface JobLine {
	/** A place in the line, or null when `limit + maxWaiting` are already held. */
	reserve(): Slot | null;
	/** Refuses new work and rejects every waiting job; running jobs go on. */
	close(): void;
	/** Resolves when no job is running. */
	idle(): Promise<void>;
}

/**
 * Lets at most `limit` jobs run at once. Every admitted request first reserves
 * a place; at most `limit + maxWaiting` are held, so the line never grows past
 * `maxWaiting`. A waiting job leaves the line when its client goes away, its
 * deadline passes or the line closes.
 */
export function limitJobs(
	runner: Runner,
	limit: number,
	maxWaiting: number,
	now: () => number = Date.now,
): JobLine {
	let running = 0;
	let reserved = 0;
	let closed = false;
	const waiting: { start: () => void; cancel: (reason: string) => void }[] = [];
	const idlers: (() => void)[] = [];
	const next = () => {
		while (!closed && running < limit && waiting.length)
			waiting.shift()?.start();
	};
	const enqueue = (job: ExtractJob, signal: AbortSignal, deadline: number) =>
		new Promise<string>((resolve, reject) => {
			if (closed) return reject(aborted("voyput-local is shutting down"));
			if (signal.aborted) return reject(aborted("client went away"));
			if (now() >= deadline)
				return reject(aborted("deadline passed before the job could start"));
			const timer = setTimeout(
				() => leave("deadline passed while waiting for a free run"),
				Math.max(0, deadline - now()),
			);
			const entry = {
				start: () => {
					clearTimeout(timer);
					signal.removeEventListener("abort", onAbort);
					if (signal.aborted) return reject(aborted("client went away"));
					// The timer may not have fired yet when a run frees up.
					if (now() >= deadline)
						return reject(
							aborted("deadline passed while waiting for a free run"),
						);
					running++;
					runner
						.run(job, signal, deadline)
						.then(resolve, reject)
						.finally(() => {
							running--;
							next();
							if (running === 0) for (const idle of idlers.splice(0)) idle();
						});
				},
				cancel: (reason: string) => leave(reason),
			};
			const leave = (reason: string) => {
				const index = waiting.indexOf(entry);
				if (index < 0) return;
				waiting.splice(index, 1);
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				reject(aborted(reason));
			};
			const onAbort = () => leave("client went away");
			signal.addEventListener("abort", onAbort);
			waiting.push(entry);
			next();
		});
	return {
		reserve() {
			if (closed || reserved >= limit + maxWaiting) return null;
			reserved++;
			let used = false;
			let released = false;
			return {
				run(job, signal, deadline) {
					if (used) return Promise.reject(new Error("slot already used"));
					used = true;
					return enqueue(job, signal, deadline);
				},
				release() {
					if (released) return;
					released = true;
					reserved--;
				},
			};
		},
		close() {
			closed = true;
			for (const entry of [...waiting])
				entry.cancel("voyput-local is shutting down");
		},
		idle: () =>
			running === 0
				? Promise.resolve()
				: new Promise<void>((resolve) => idlers.push(resolve)),
	};
}

/** Counts body bytes held at once. */
export function byteBudget(max: number) {
	let used = 0;
	return {
		take(bytes: number): boolean {
			if (used + bytes > max) return false;
			used += bytes;
			return true;
		},
		give(bytes: number) {
			used -= bytes;
		},
		used: () => used,
	};
}

/** `Deps.reserve`: a job place and the body's bytes, taken together or not at all. */
export function reserveFrom(
	line: JobLine,
	budget: ReturnType<typeof byteBudget>,
): Deps["reserve"] {
	return (bytes) => {
		if (!budget.take(bytes)) return null;
		const slot = line.reserve();
		if (!slot) {
			budget.give(bytes);
			return null;
		}
		let released = false;
		return {
			run: slot.run,
			release() {
				if (released) return;
				released = true;
				slot.release();
				budget.give(bytes);
			},
		};
	};
}

/** One CLI call: program, fixed flags, what goes to stdin, where the answer lands. */
export interface Command {
	program: Engine;
	args: string[];
	stdin: string;
	/** Codex writes its last message here; Claude answers on stdout. */
	answerFile: string | null;
}

/** Files of a job inside its temp dir. */
export const jobFiles = (dir: string, mediaType: MediaType) => ({
	image: join(dir, mediaType === "image/png" ? "page.png" : "page.jpg"),
	system: join(dir, "system.txt"),
	answer: join(dir, "answer.txt"),
});

/**
 * `codex exec`, verified against codex-cli 0.169.0 (`codex exec --help`,
 * `codex features list`, `codex debug prompt-input`): read-only sandbox, no
 * shell tool, no image viewer tool, no web search, no git check, no session
 * files, no user config or rules, the temp dir as working root, the image
 * attached, the prompt on stdin. Codex still offers a filesystem-less
 * JavaScript `exec`, `apply_patch` (blocked by the read-only sandbox) and
 * sub-agent tools that no flag turns off (ADR 0032: on unless `--no-codex`).
 */
export function codexCommand(dir: string, job: ExtractJob): Command {
	const files = jobFiles(dir, job.image.mediaType);
	return {
		program: "codex",
		args: [
			"exec",
			"--sandbox",
			"read-only",
			"--disable",
			"shell_tool",
			"--disable",
			"view_image",
			"-c",
			'web_search="disabled"',
			"--skip-git-repo-check",
			"--ephemeral",
			"--ignore-user-config",
			"--ignore-rules",
			"--color",
			"never",
			"--cd",
			dir,
			"--output-last-message",
			files.answer,
			"--image",
			files.image,
		],
		stdin: `${job.system}\n\n${job.text}`,
		answerFile: files.answer,
	};
}

/**
 * `claude -p`, verified against Claude Code 2.1.325 `claude --help`: no tools at
 * all (the image is sent inline as base64), our system prompt from a file, no
 * session saved, no customizations or MCP servers, JSON events out.
 */
export function claudeCommand(dir: string, job: ExtractJob): Command {
	const files = jobFiles(dir, job.image.mediaType);
	const message = {
		type: "user",
		message: {
			role: "user",
			content: [
				{
					type: "image",
					source: {
						type: "base64",
						media_type: job.image.mediaType,
						data: job.image.data.toString("base64"),
					},
				},
				{ type: "text", text: job.text },
			],
		},
	};
	return {
		program: "claude",
		args: [
			"-p",
			"--input-format",
			"stream-json",
			"--output-format",
			"stream-json",
			"--verbose",
			"--tools",
			"",
			"--system-prompt-file",
			files.system,
			"--no-session-persistence",
			"--safe-mode",
			"--strict-mcp-config",
		],
		stdin: `${JSON.stringify(message)}\n`,
		answerFile: null,
	};
}

/** The final text from Claude's stream-json events. */
export function claudeAnswer(stdout: string): string {
	for (const line of stdout.split("\n").reverse()) {
		let event: unknown;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isObject(event) || event.type !== "result") continue;
		if (event.is_error === true || event.subtype !== "success")
			throw new Error(
				`claude failed: ${typeof event.result === "string" ? event.result : String(event.subtype)}`,
			);
		if (typeof event.result !== "string" || !event.result.trim())
			throw new Error("claude returned no text");
		return event.result;
	}
	throw new Error("claude printed no result");
}

/** Where a program lives on PATH, or null. */
export function findOnPath(
	name: string,
	env: NodeJS.ProcessEnv,
	platform: NodeJS.Platform,
	exists: (path: string) => boolean = existsSync,
): string | null {
	const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
	const exts =
		platform === "win32"
			? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
			: [""];
	for (const dir of dirs)
		for (const ext of exts) {
			const path = join(dir, name + ext);
			if (exists(path)) return path;
		}
	return null;
}

/**
 * The only variables the CLIs get: where programs and their config and login
 * live, locale, temp, proxies and certificates, and their own API keys.
 */
const CHILD_ENV = [
	"PATH",
	"Path",
	"PATHEXT",
	"HOME",
	"USER",
	"LOGNAME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TMPDIR",
	"TEMP",
	"TMP",
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_CACHE_HOME",
	"XDG_RUNTIME_DIR",
	"DBUS_SESSION_BUS_ADDRESS",
	"SystemRoot",
	"SYSTEMROOT",
	"ComSpec",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"HOMEDRIVE",
	"HOMEPATH",
	"CODEX_HOME",
	"OPENAI_API_KEY",
	"CODEX_API_KEY",
	"CLAUDE_CONFIG_DIR",
	"ANTHROPIC_API_KEY",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"HTTPS_PROXY",
	"HTTP_PROXY",
	"NO_PROXY",
	"https_proxy",
	"http_proxy",
	"no_proxy",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"NODE_EXTRA_CA_CERTS",
];

export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const picked: NodeJS.ProcessEnv = {};
	for (const key of CHILD_ENV)
		if (env[key] !== undefined) picked[key] = env[key];
	return picked;
}

const lastLine = (text: string) =>
	text.trim().split("\n").pop()?.slice(0, 500) ?? "";

/** Windows needs a shell for .cmd shims; quote every argument for cmd.exe. */
const quoteForCmd = (arg: string) => `"${arg.replace(/"/g, '""')}"`;

/** Kills a CLI and everything it started. */
/**
 * Kills a CLI and everything it started. On POSIX the CLI leads its own
 * process group (detached), and the group outlives its leader, so this also
 * reaches descendants after the CLI itself exited. On Windows `taskkill /T`
 * finds descendants only through a live parent.
 */
function killTree(child: ChildProcess) {
	if (child.pid === undefined) return;
	try {
		if (process.platform === "win32")
			spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				windowsHide: true,
			}).on("error", () => {});
		else process.kill(-child.pid, "SIGKILL");
	} catch {
		// ESRCH: nothing left in the group.
		if (child.exitCode === null) child.kill("SIGKILL");
	}
}

/**
 * Collects a CLI pipe as bytes, at most `max` of them, and decodes it once, so a
 * UTF-8 character split across two chunks stays whole.
 */
export function outputCollector(max: number) {
	const chunks: Buffer[] = [];
	let size = 0;
	return {
		add(chunk: Buffer) {
			if (size >= max) return;
			const part = chunk.subarray(0, max - size);
			chunks.push(part);
			size += part.length;
		},
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

/** Jobs running now: their CLI process and temp dir, for shutdown. */
const active = new Map<string, ChildProcess | null>();
/** Set on shutdown: no CLI may start after it. */
let closing = false;

/**
 * Runs one CLI and settles once, even when a descendant keeps its pipes open:
 * when the CLI exits (or is killed) the rest of its group is killed too, and
 * after `graceMs` the pipes are destroyed and the result settles.
 */
export function runProcess(
	path: string,
	command: Command,
	cwd: string,
	signal: AbortSignal,
	deadline: number,
	graceMs: number = PIPE_GRACE_MS,
): Promise<string> {
	const windows = process.platform === "win32";
	return new Promise((resolve, reject) => {
		if (closing) return reject(aborted("voyput-local is shutting down"));
		if (Date.now() >= deadline)
			return reject(aborted("deadline passed before the CLI could start"));
		if (signal.aborted)
			return reject(aborted("client went away before the CLI could start"));
		const child = spawn(
			windows ? quoteForCmd(path) : path,
			windows ? command.args.map(quoteForCmd) : command.args,
			{
				cwd,
				env: childEnv(process.env),
				shell: windows,
				detached: !windows,
				stdio: ["pipe", "pipe", "pipe"],
				windowsHide: true,
			},
		);
		active.set(cwd, child);
		let stopped = "";
		let exit: { code: number | null; signal: string | null } | null = null;
		let settled = false;
		let grace: ReturnType<typeof setTimeout> | undefined;
		const stdout = outputCollector(MAX_OUTPUT_BYTES);
		const stderr = outputCollector(MAX_OUTPUT_BYTES);
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			clearTimeout(grace);
			signal.removeEventListener("abort", onAbort);
			for (const stream of [child.stdin, child.stdout, child.stderr])
				stream?.destroy();
			active.set(cwd, null);
			if (error) return reject(error);
			const result = exit ?? { code: null, signal: null };
			if (stopped || result.signal)
				reject(
					new Error(
						`${command.program} ${stopped || `stopped (${result.signal})`}`,
					),
				);
			else if (result.code !== 0)
				reject(
					new Error(
						`${command.program} exited with code ${result.code}: ${lastLine(stderr.text()) || lastLine(stdout.text())}`,
					),
				);
			else resolve(stdout.text());
		};
		/** Kills the tree, then gives the pipes `graceMs` before giving up on them. */
		const stop = (reason: string) => {
			if (settled) return;
			stopped ||= reason;
			killTree(child);
			grace ??= setTimeout(() => finish(), graceMs);
		};
		const timer = setTimeout(
			() => stop("timed out"),
			Math.max(0, deadline - Date.now()),
		);
		const onAbort = () => stop("cancelled: the client went away");
		signal.addEventListener("abort", onAbort);
		child.stdout?.on("data", (chunk: Buffer) => stdout.add(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.add(chunk));
		child.on("error", (error) => finish(error));
		child.on("exit", (code, exitSignal) => {
			exit = { code, signal: exitSignal };
			// Descendants left behind would hold the pipes open; end them too.
			killTree(child);
			grace ??= setTimeout(() => finish(), graceMs);
		});
		child.on("close", (code, closeSignal) => {
			exit ??= { code, signal: closeSignal };
			finish();
		});
		child.stdin?.on("error", () => {});
		child.stdin?.end(command.stdin);
	});
}

/** Deletes a temp dir; retries cover Windows, where a killed CLI may still hold files. */
const removeDir = (dir: string) =>
	rm(dir, { recursive: true, force: true, maxRetries: 3 });

/**
 * Runs the CLIs for real: one temp dir per job, deleted afterwards. A failed
 * delete is logged and never replaces the job's result; shutdown and the next
 * start remove the dir.
 */
export function cliRunner(
	paths: Partial<Record<Engine, string>>,
	remove: (dir: string) => Promise<void> = removeDir,
): Runner {
	return {
		async run(job, signal, deadline) {
			const path = paths[job.engine];
			if (!path) throw new Error(`${job.engine} is not available`);
			if (Date.now() >= deadline)
				throw aborted("deadline passed before the job could start");
			// The pid in the name lets a later start remove dirs of a crashed run.
			const dir = await mkdtemp(
				join(tmpdir(), `${TEMP_PREFIX}${process.pid}-`),
			);
			active.set(dir, null);
			try {
				if (closing) throw aborted("voyput-local is shutting down");
				const files = jobFiles(dir, job.image.mediaType);
				await writeFile(files.image, job.image.data, { mode: 0o600 });
				await writeFile(files.system, job.system, { mode: 0o600 });
				const command =
					job.engine === "codex"
						? codexCommand(dir, job)
						: claudeCommand(dir, job);
				const stdout = await runProcess(path, command, dir, signal, deadline);
				if (!command.answerFile) return claudeAnswer(stdout);
				const answer = await readFile(command.answerFile, "utf8");
				if (!answer.trim()) throw new Error("codex returned no text");
				return answer;
			} finally {
				try {
					await remove(dir);
				} catch (error) {
					process.stderr.write(
						`  could not delete ${dir}: ${error instanceof Error ? error.message : String(error)}\n`,
					);
				} finally {
					active.delete(dir);
				}
			}
		},
	};
}

/** The pid in a temp dir name of ours, or null. */
export function tempDirPid(name: string): number | null {
	const match = new RegExp(`^${TEMP_PREFIX}(\\d+)-`).exec(name);
	return match?.[1] ? Number(match[1]) : null;
}

const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

/**
 * Removes temp dirs (with their photos) left by runs that crashed, and with
 * `own` also this run's dirs whose delete failed.
 */
async function removeStaleDirs(own = false) {
	const base = tmpdir();
	for (const name of await readdir(base).catch(() => [])) {
		const pid = tempDirPid(name);
		if (pid === null) continue;
		if (pid === process.pid ? !own : isAlive(pid)) continue;
		await removeDir(join(base, name)).catch(() => {});
	}
}

/**
 * Stops the line (waiting jobs are rejected, none start), kills running CLI
 * trees, waits for their jobs to delete their temp dirs, removes any left
 * (also those whose delete failed), then exits.
 */
async function shutdown(line: JobLine, code: number) {
	if (closing) return;
	closing = true;
	line.close();
	for (const child of active.values()) if (child) killTree(child);
	await line.idle();
	await Promise.all(
		[...active.keys()].map((dir) => removeDir(dir).catch(() => {})),
	);
	await removeStaleDirs(true);
	process.exit(code);
}

/** The token is kept so the app stays paired across restarts. */
function loadToken(fresh: boolean): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	const dir = join(base, "voyput-local");
	const file = join(dir, "token");
	if (!fresh && existsSync(file)) {
		const stored = readFileSync(file, "utf8").trim();
		if (/^[A-Za-z0-9_-]{20,}$/.test(stored)) return stored;
	}
	const token = randomBytes(24).toString("base64url");
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	writeFileSync(file, `${token}\n`, { mode: 0o600 });
	return token;
}

/** The Settings link that pairs the app with this server. */
export function pairingLink(
	token: string,
	port: number,
	site = SITE_ORIGIN,
): string {
	const portPart = port === DEFAULT_PORT ? "" : `&port=${port}`;
	return `${site}/settings#local=${token}${portPart}`;
}

const HELP = `voyput-local ${VERSION}: read passport stamps for voyput with your Claude Code or Codex CLI.

Usage: node voyput-local.mjs [--port <n>] [--site <origin>] [--no-codex] [--new-token]

  --port <n>     Port on 127.0.0.1 (default ${DEFAULT_PORT}).
  --site <origin>
                 The voyput site that may call this server and that the
                 pairing link opens (default ${SITE_ORIGIN}).
                 A copy on your own domain: --site https://voyput.example.org
  --no-codex     Do not offer the Codex CLI. Codex keeps a few tools that cannot
                 be turned off (see docs/adr/0032-codex-on-by-default.md); Claude
                 Code runs with none.
  --new-token    Forget the stored pairing token and make a new one.
  --help         Show this text.
`;

/**
 * Reads exactly the admitted length before the request's deadline. An upload
 * that is cut off, longer than admitted, or still arriving at the deadline is
 * destroyed and answered with an error instead.
 */
export function readBody(
	request: Readable,
	length: number,
	deadline: number,
	now: () => number = Date.now,
): Promise<{ body: string } | { status: number; error: string }> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let done = false;
		const settle = (
			result: { body: string } | { status: number; error: string },
		) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			if (!("body" in result)) request.destroy();
			resolve(result);
		};
		const timer = setTimeout(
			() => settle({ status: 408, error: "upload did not finish in time" }),
			Math.max(0, deadline - now()),
		);
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > length)
				return settle({ status: 413, error: "body longer than declared" });
			chunks.push(chunk);
		});
		request.on("end", () =>
			settle({ body: Buffer.concat(chunks).toString("utf8") }),
		);
		request.on("error", () => settle({ status: 400, error: "upload cut off" }));
		request.on("close", () => settle({ status: 400, error: "upload cut off" }));
	});
}

const ENGINE_NAMES: Record<Engine, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

/** How each engine stands at start: ready, turned off with --no-codex, or missing. */
export type EngineState = "ready" | "off" | "missing";

/**
 * The text printed on start, pairing link first. `color` adds ANSI styles
 * (only for a terminal that wants them).
 */
export function banner(
	info: {
		port: number;
		token: string;
		engines: Record<Engine, EngineState>;
		/** Defaults to the public site. */
		site?: string;
	},
	color: boolean,
): string {
	const style = (code: string) => (text: string) =>
		color ? `\x1b[${code}m${text}\x1b[0m` : text;
	const bold = style("1");
	const dim = style("2");
	const green = style("32");
	const yellow = style("33");
	const cyan = style("36;4");
	const ready = ENGINES.some((engine) => info.engines[engine] === "ready");
	const engineLine = ENGINES.map((engine) => {
		const state = info.engines[engine];
		const name = ENGINE_NAMES[engine];
		if (state === "ready") return `${green("●")} ${name}`;
		if (state === "off") return dim(`○ ${name} (off: --no-codex)`);
		return dim(`○ ${name} (not installed)`);
	}).join("   ");
	const label = (text: string) => dim(text.padEnd(9));
	return [
		"",
		`  ${bold("voyput-local")} ${dim(`v${VERSION}`)}  ${ready ? green("ready") : yellow("no engine")}`,
		"",
		`  ${bold("Pair:")} open this link in the browser where you use voyput`,
		`    ${cyan(pairingLink(info.token, info.port, info.site))}`,
		`  ${dim("or paste the token in Settings → AI → Local:")} ${info.token}`,
		"",
		`  ${label("Engines")}${engineLine}`,
		...(ready
			? []
			: [
					`  ${" ".repeat(9)}${yellow("Install Claude Code or Codex CLI, log in, then restart.")}`,
				]),
		`  ${label("Server")}127.0.0.1:${info.port} ${dim("· this computer only · the app talks to it, no need to open it")}`,
		`  ${label("Privacy")}photos go only to Anthropic or OpenAI, under your own account`,
		`  ${label("Stop")}Ctrl+C ${dim("· deletes any photo still in a temp folder")}`,
		"",
		dim("  Requests:"),
		"",
	].join("\n");
}

const headerMap = (request: IncomingMessage) => {
	const headers: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(request.headers))
		headers[key] = Array.isArray(value) ? value.join(", ") : value;
	return headers;
};

/**
 * Answers a request refused before its body and drops the connection once the
 * answer is sent, so a refused upload is never read.
 */
export function refuse(
	request: IncomingMessage,
	response: ServerResponse,
	result: PlainResponse,
) {
	if (response.destroyed) return request.destroy();
	response.writeHead(result.status, {
		...result.headers,
		connection: "close",
	});
	response.end(result.body, () => request.destroy());
}

async function main() {
	const { values } = parseArgs({
		options: {
			port: { type: "string" },
			site: { type: "string" },
			codex: { type: "boolean" },
			"no-codex": { type: "boolean" },
			"new-token": { type: "boolean" },
			help: { type: "boolean" },
		},
	});
	if (values.help) {
		process.stdout.write(HELP);
		return;
	}
	const port = values.port ? Number(values.port) : DEFAULT_PORT;
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		process.stderr.write(`--port must be 1-65535, got ${values.port}\n`);
		process.exit(2);
	}
	const site = values.site === undefined ? SITE_ORIGIN : parseSite(values.site);
	if (site === null) {
		process.stderr.write(
			`--site must be an origin like https://voyput.example.org, got ${values.site}\n`,
		);
		process.exit(2);
	}
	await removeStaleDirs();
	const paths: Partial<Record<Engine, string>> = {};
	for (const engine of ENGINES) {
		const path = findOnPath(engine, process.env, process.platform);
		if (path) paths[engine] = path;
	}
	const found = { ...paths };
	// `--codex` is accepted for old commands; Codex is on unless --no-codex.
	if (values["no-codex"] === true) delete paths.codex;
	const engines = ENGINES.filter((engine) => paths[engine]);
	const token = loadToken(values["new-token"] === true);
	const line = limitJobs(cliRunner(paths), MAX_JOBS, MAX_WAITING);
	const deps: Deps = {
		token,
		port,
		site,
		engines,
		nonces: new NonceGuard(),
		reserve: reserveFrom(line, byteBudget(MAX_BUFFERED_BYTES)),
	};

	const server = createServer(async (request, response) => {
		const started = Date.now();
		const head: HeadRequest = {
			method: request.method ?? "GET",
			path: (request.url ?? "/").split("?")[0] ?? "/",
			headers: headerMap(request),
		};
		const controller = new AbortController();
		response.on("close", () => {
			if (!response.writableFinished) controller.abort();
		});
		let result: PlainResponse;
		const admitted = admit(head, deps, started);
		if ("response" in admitted) {
			result = admitted.response;
			refuse(request, response, result);
		} else {
			// The slot (queue place and body bytes) is held until the answer is sent.
			try {
				const length = Number(request.headers["content-length"] ?? 0);
				const read = await readBody(request, length, started + JOB_DEADLINE_MS);
				result =
					"error" in read
						? {
								status: read.status,
								headers: {
									...admitted.cors,
									"content-type": "application/json",
								},
								body: JSON.stringify({ error: read.error }),
							}
						: await respond(
								{ ...head, body: read.body },
								admitted,
								deps,
								controller.signal,
								started + JOB_DEADLINE_MS,
							);
				if (!response.destroyed) {
					response.writeHead(result.status, result.headers);
					response.end(result.body);
				}
			} finally {
				admitted.slot?.release();
			}
		}
		// Never log bodies: they hold passport photos and model answers.
		const seconds = ((Date.now() - started) / 1000).toFixed(1);
		process.stdout.write(
			`  ${head.method} ${head.path} ${result.status} ${seconds}s\n`,
		);
	});
	server.requestTimeout = JOB_DEADLINE_MS + 60_000;
	server.on("error", (error: NodeJS.ErrnoException) => {
		process.stderr.write(
			error.code === "EADDRINUSE"
				? `Port ${port} is in use. Is voyput-local already running? Try --port.\n`
				: `${error.message}\n`,
		);
		process.exit(1);
	});
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
		process.on(signal, () => {
			server.close();
			void shutdown(line, 0);
		});
	server.listen(port, "127.0.0.1", () => {
		const state = (engine: Engine): EngineState =>
			paths[engine] ? "ready" : found[engine] ? "off" : "missing";
		const engineStates = { claude: state("claude"), codex: state("codex") };
		const color =
			process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
		process.stdout.write(
			banner({ port, token, engines: engineStates, site }, color),
		);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main();
