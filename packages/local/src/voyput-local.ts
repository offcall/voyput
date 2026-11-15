/**
 * voyput-local: reads passport stamps for the voyput app with the Claude Code
 * CLI (or, opt-in, the Codex CLI) already installed and logged in here.
 *
 * One file, Node >= 22.12 built-ins only. The site serves it as JavaScript
 * (types stripped at build time); from a clone, run this .ts file with
 * `node --experimental-strip-types`.
 *
 *   node voyput-local.mjs [--port 47615] [--codex] [--new-token]
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
import { createServer, type IncomingMessage } from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const VERSION = "3";
export const DEFAULT_PORT = 47615;
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

/** The public site, and any localhost port for a dev server or a clone. */
export function isAllowedOrigin(origin: string): boolean {
	if (origin === SITE_ORIGIN) return true;
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
	if (origin !== undefined && !isAllowedOrigin(origin))
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
					? "no engine found: install Claude Code (or Codex CLI and start with --codex) and log in"
					: wanted === "codex"
						? "Codex is off: start voyput-local with --codex (see Settings)"
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
			const timer = setTimeout(
				() => leave("deadline passed while waiting for a free run"),
				Math.max(0, deadline - now()),
			);
			const entry = {
				start: () => {
					clearTimeout(timer);
					signal.removeEventListener("abort", onAbort);
					if (signal.aborted) return reject(aborted("client went away"));
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
 * sub-agent tools that no flag turns off, so Codex is opt-in (`--codex`).
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
function killTree(child: ChildProcess) {
	if (child.pid === undefined || child.exitCode !== null) return;
	try {
		if (process.platform === "win32")
			spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				windowsHide: true,
			});
		// Detached: the child leads its own process group.
		else process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

/** Jobs running now: their CLI process and temp dir, for shutdown. */
const active = new Map<string, ChildProcess | null>();
/** Set on shutdown: no CLI may start after it. */
let closing = false;

function runProcess(
	path: string,
	command: Command,
	cwd: string,
	signal: AbortSignal,
	deadline: number,
): Promise<string> {
	const windows = process.platform === "win32";
	return new Promise((resolve, reject) => {
		if (closing) return reject(aborted("voyput-local is shutting down"));
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
		const stop = (reason: string) => {
			stopped = reason;
			killTree(child);
		};
		const timer = setTimeout(
			() => stop("timed out"),
			Math.max(0, deadline - Date.now()),
		);
		const onAbort = () => stop("cancelled: the client went away");
		signal.addEventListener("abort", onAbort);
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code, killed) => {
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			active.set(cwd, null);
			if (stopped || killed)
				reject(
					new Error(`${command.program} ${stopped || `stopped (${killed})`}`),
				);
			else if (code !== 0)
				reject(
					new Error(
						`${command.program} exited with code ${code}: ${lastLine(stderr) || lastLine(stdout)}`,
					),
				);
			else resolve(stdout);
		});
		child.stdin?.on("error", () => {});
		child.stdin?.end(command.stdin);
		if (signal.aborted) onAbort();
	});
}

/** Runs the CLIs for real: one temp dir per job, deleted afterwards. */
export function cliRunner(paths: Partial<Record<Engine, string>>): Runner {
	return {
		async run(job, signal, deadline) {
			const path = paths[job.engine];
			if (!path) throw new Error(`${job.engine} is not available`);
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
				await rm(dir, { recursive: true, force: true });
				active.delete(dir);
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

/** Removes temp dirs (with their photos) left by runs that crashed. */
async function removeStaleDirs() {
	const base = tmpdir();
	for (const name of await readdir(base).catch(() => [])) {
		const pid = tempDirPid(name);
		if (pid === null || pid === process.pid || isAlive(pid)) continue;
		await rm(join(base, name), { recursive: true, force: true }).catch(
			() => {},
		);
	}
}

/**
 * Stops the line (waiting jobs are rejected, none start), kills running CLI
 * trees, waits for their jobs to delete their temp dirs, removes any left,
 * then exits.
 */
async function shutdown(line: JobLine, code: number) {
	if (closing) return;
	closing = true;
	line.close();
	for (const child of active.values()) if (child) killTree(child);
	await line.idle();
	await Promise.all(
		[...active.keys()].map((dir) =>
			rm(dir, { recursive: true, force: true }).catch(() => {}),
		),
	);
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
export function pairingLink(token: string, port: number): string {
	const portPart = port === DEFAULT_PORT ? "" : `&port=${port}`;
	return `${SITE_ORIGIN}/settings#local=${token}${portPart}`;
}

const HELP = `voyput-local ${VERSION}: read passport stamps for voyput with your Claude Code or Codex CLI.

Usage: node voyput-local.mjs [--port <n>] [--codex] [--new-token]

  --port <n>     Port on 127.0.0.1 (default ${DEFAULT_PORT}).
  --codex        Also offer the Codex CLI. Codex keeps a few tools that cannot be
                 turned off (see docs/adr/0026-local-ai-engine.md); Claude Code
                 runs with none.
  --new-token    Forget the stored pairing token and make a new one.
  --help         Show this text.
`;

/** Reads exactly the admitted length; null when the upload is cut off or longer. */
function readBody(
	request: IncomingMessage,
	length: number,
): Promise<string | null> {
	return new Promise<string | null>((resolve) => {
		const chunks: Buffer[] = [];
		let size = 0;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > length) {
				request.destroy();
				resolve(null);
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", () => resolve(null));
		request.on("close", () => resolve(null));
	});
}

const headerMap = (request: IncomingMessage) => {
	const headers: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(request.headers))
		headers[key] = Array.isArray(value) ? value.join(", ") : value;
	return headers;
};

async function main() {
	const { values } = parseArgs({
		options: {
			port: { type: "string" },
			codex: { type: "boolean" },
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
	await removeStaleDirs();
	const paths: Partial<Record<Engine, string>> = {};
	for (const engine of ENGINES) {
		const path = findOnPath(engine, process.env, process.platform);
		if (path) paths[engine] = path;
	}
	const codexOff = Boolean(paths.codex) && values.codex !== true;
	if (codexOff) delete paths.codex;
	const engines = ENGINES.filter((engine) => paths[engine]);
	const token = loadToken(values["new-token"] === true);
	const line = limitJobs(cliRunner(paths), MAX_JOBS, MAX_WAITING);
	const deps: Deps = {
		token,
		port,
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
			request.resume();
		} else {
			// The slot (queue place and body bytes) is held until the answer is sent.
			try {
				const length = Number(request.headers["content-length"] ?? 0);
				const body = await readBody(request, length);
				result =
					body === null
						? {
								status: 400,
								headers: {
									...admitted.cors,
									"content-type": "application/json",
								},
								body: JSON.stringify({ error: "upload cut off" }),
							}
						: await respond(
								{ ...head, body },
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
		if ("response" in admitted && !response.destroyed) {
			response.writeHead(result.status, result.headers);
			response.end(result.body);
		}
		// Never log bodies: they hold passport photos and model answers.
		const seconds = ((Date.now() - started) / 1000).toFixed(1);
		process.stdout.write(
			`${head.method} ${head.path} ${result.status} ${seconds}s\n`,
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
		process.stdout.write(
			[
				`voyput-local ${VERSION} on http://127.0.0.1:${port} (this computer only)`,
				`Engines: ${engines.length ? engines.join(", ") : "none found. Install Claude Code (or Codex CLI, with --codex), log in, restart."}`,
				...(codexOff
					? [
							"Codex CLI found but off: it keeps a few tools that cannot be turned off. Start with --codex to use it.",
						]
					: []),
				"",
				"Pair voyput with this server: open",
				`  ${pairingLink(token, port)}`,
				`or paste this token in Settings → AI → Local: ${token}`,
				"",
				"Photos go only to the CLI's own provider (Anthropic or OpenAI) under your account.",
				"Ctrl+C stops and deletes any photo still in a temp folder.",
				"",
			].join("\n"),
		);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	void main();
