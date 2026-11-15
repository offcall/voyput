/**
 * voyput-local: reads passport stamps for the voyput app with the Codex CLI or
 * Claude Code CLI already installed and logged in on this computer.
 *
 * One file, Node >= 22 built-ins only. The site serves it as JavaScript
 * (types stripped at build time); from a clone, run this .ts file with Node.
 *
 *   node voyput-local.mjs [--port 47615] [--new-token]
 *
 * It listens on 127.0.0.1 only and answers only requests that carry the pairing
 * token it prints. The image goes to the CLI's own provider (OpenAI for Codex,
 * Anthropic for Claude Code) under your account; nothing goes to voyput.
 * See docs/adr/0026-local-ai-engine.md.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const VERSION = "1";
export const DEFAULT_PORT = 47615;
export const SITE_ORIGIN = "https://voyput.app.offcall.link";
export const TOKEN_HEADER = "x-voyput-token";
export const MAX_BODY_BYTES = 30 * 1024 * 1024;
export const JOB_TIMEOUT_MS = 10 * 60_000;
/** CLI runs at once; more requests wait in line. */
export const MAX_JOBS = 2;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export type Engine = "codex" | "claude";
export const ENGINES: readonly Engine[] = ["codex", "claude"];
export type MediaType = "image/jpeg" | "image/png";

export interface ExtractJob {
	engine: Engine;
	system: string;
	text: string;
	image: { mediaType: MediaType; data: Buffer };
}

/** Runs one job through a CLI and returns the model's final text. */
export interface Runner {
	run(job: ExtractJob): Promise<string>;
}

export interface Deps {
	token: string;
	port: number;
	/** Engines found on PATH, in "auto" order. */
	engines: readonly Engine[];
	runner: Runner;
}

export interface PlainRequest {
	method: string;
	path: string;
	headers: Record<string, string | undefined>;
	body: string;
}

export interface PlainResponse {
	status: number;
	headers: Record<string, string>;
	body: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** The public site, and any localhost port for a dev server or a clone. */
export function isAllowedOrigin(origin: string): boolean {
	if (origin === SITE_ORIGIN) return true;
	return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

/** Rejects DNS-rebinding: the Host must name this machine's loopback. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
	return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Constant-time comparison of the given token with the expected one. */
export function tokenMatches(expected: string, given: string | undefined) {
	if (!given) return false;
	const digest = (value: string) => createHash("sha256").update(value).digest();
	return timingSafeEqual(digest(expected), digest(given));
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
	origin
		? {
				"access-control-allow-origin": origin,
				vary: "Origin",
			}
		: {};

const DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

/** Validates a POST /extract body. */
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
					? "no engine found: install Codex CLI or Claude Code and log in"
					: `${wanted} was not found on PATH when voyput-local started`,
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

/** Every HTTP answer of the server, without sockets. */
export async function handle(
	request: PlainRequest,
	deps: Deps,
): Promise<PlainResponse> {
	if (!isAllowedHost(request.headers.host, deps.port))
		return json(403, { error: "wrong host" });
	const origin = request.headers.origin;
	if (origin !== undefined && !isAllowedOrigin(origin))
		return json(403, { error: "origin not allowed" });
	const cors = corsHeaders(origin);

	if (request.method === "OPTIONS") {
		const headers: Record<string, string> = {
			...cors,
			"access-control-allow-methods": "GET, POST",
			"access-control-allow-headers": `content-type, ${TOKEN_HEADER}`,
			"access-control-max-age": "600",
		};
		// Private Network Access preflight (Chromium).
		if (request.headers["access-control-request-private-network"] === "true")
			headers["access-control-allow-private-network"] = "true";
		return { status: 204, headers, body: "" };
	}

	if (!tokenMatches(deps.token, request.headers[TOKEN_HEADER]))
		return json(401, { error: "wrong or missing pairing token" }, cors);

	if (request.method === "GET" && request.path === "/health")
		return json(
			200,
			{ app: "voyput-local", version: VERSION, engines: deps.engines },
			cors,
		);

	if (request.method === "POST" && request.path === "/extract") {
		const parsed = parseExtractBody(request.body, deps.engines);
		if ("error" in parsed)
			return json(parsed.status, { error: parsed.error }, cors);
		try {
			const text = await deps.runner.run(parsed.job);
			return json(200, { text, engine: parsed.job.engine }, cors);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return json(502, { error: message, engine: parsed.job.engine }, cors);
		}
	}
	return json(404, { error: "not found" }, cors);
}

/** Lets at most `limit` jobs run at once; the rest wait in order. */
export function limitJobs(runner: Runner, limit: number): Runner {
	let running = 0;
	const waiting: (() => void)[] = [];
	return {
		async run(job) {
			if (running >= limit)
				await new Promise<void>((resolve) => waiting.push(resolve));
			running++;
			try {
				return await runner.run(job);
			} finally {
				running--;
				waiting.shift()?.();
			}
		},
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
 * `codex exec`, verified against codex-cli 0.169.0 `codex exec --help`:
 * read-only sandbox, no git check, no session files, no user config or rules,
 * the temp dir as working root, the image attached, the prompt on stdin.
 */
export function codexCommand(dir: string, job: ExtractJob): Command {
	const files = jobFiles(dir, job.image.mediaType);
	return {
		program: "codex",
		args: [
			"exec",
			"--sandbox",
			"read-only",
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

const lastLine = (text: string) =>
	text.trim().split("\n").pop()?.slice(0, 500) ?? "";

/** Windows needs a shell for .cmd shims; quote every argument for cmd.exe. */
const quoteForCmd = (arg: string) => `"${arg.replace(/"/g, '""')}"`;

function runProcess(
	path: string,
	command: Command,
	cwd: string,
): Promise<string> {
	const windows = process.platform === "win32";
	return new Promise((resolve, reject) => {
		const child = spawn(
			windows ? quoteForCmd(path) : path,
			windows ? command.args.map(quoteForCmd) : command.args,
			{
				cwd,
				shell: windows,
				stdio: ["pipe", "pipe", "pipe"],
				timeout: JOB_TIMEOUT_MS,
				killSignal: "SIGKILL",
				windowsHide: true,
			},
		);
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (signal)
				reject(
					new Error(
						`${command.program} was stopped (${signal}); it may have timed out`,
					),
				);
			else if (code !== 0)
				reject(
					new Error(
						`${command.program} exited with code ${code}: ${lastLine(stderr) || lastLine(stdout)}`,
					),
				);
			else resolve(stdout);
		});
		child.stdin.on("error", () => {});
		child.stdin.end(command.stdin);
	});
}

/** Runs the CLIs for real: one temp dir per job, deleted afterwards. */
export function cliRunner(paths: Partial<Record<Engine, string>>): Runner {
	return {
		async run(job) {
			const path = paths[job.engine];
			if (!path) throw new Error(`${job.engine} is not available`);
			const dir = await mkdtemp(join(tmpdir(), "voyput-local-"));
			try {
				const files = jobFiles(dir, job.image.mediaType);
				await writeFile(files.image, job.image.data, { mode: 0o600 });
				await writeFile(files.system, job.system, { mode: 0o600 });
				const command =
					job.engine === "codex"
						? codexCommand(dir, job)
						: claudeCommand(dir, job);
				const stdout = await runProcess(path, command, dir);
				if (!command.answerFile) return claudeAnswer(stdout);
				const answer = await readFile(command.answerFile, "utf8");
				if (!answer.trim()) throw new Error("codex returned no text");
				return answer;
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		},
	};
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

const HELP = `voyput-local ${VERSION}: read passport stamps for voyput with your Codex or Claude Code CLI.

Usage: node voyput-local.mjs [--port <n>] [--new-token]

  --port <n>     Port on 127.0.0.1 (default ${DEFAULT_PORT}).
  --new-token    Forget the stored pairing token and make a new one.
  --help         Show this text.
`;

function readBody(request: IncomingMessage): Promise<string | null> {
	return new Promise((resolve, reject) => {
		const declared = Number(request.headers["content-length"] ?? 0);
		if (declared > MAX_BODY_BYTES) {
			resolve(null);
			request.resume();
			return;
		}
		const chunks: Buffer[] = [];
		let size = 0;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				resolve(null);
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}

const headerMap = (request: IncomingMessage) => {
	const headers: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(request.headers))
		headers[key] = Array.isArray(value) ? value.join(", ") : value;
	return headers;
};

function main() {
	const { values } = parseArgs({
		options: {
			port: { type: "string" },
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
	const paths: Partial<Record<Engine, string>> = {};
	for (const engine of ENGINES) {
		const path = findOnPath(engine, process.env, process.platform);
		if (path) paths[engine] = path;
	}
	const engines = ENGINES.filter((engine) => paths[engine]);
	const token = loadToken(values["new-token"] === true);
	const deps: Deps = {
		token,
		port,
		engines,
		runner: limitJobs(cliRunner(paths), MAX_JOBS),
	};

	const server = createServer(async (request, response) => {
		const started = Date.now();
		const path = (request.url ?? "/").split("?")[0] ?? "/";
		let result: PlainResponse;
		const body = await readBody(request).catch(() => null);
		if (body === null)
			result = {
				status: 413,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ error: "body too large" }),
			};
		else
			result = await handle(
				{
					method: request.method ?? "GET",
					path,
					headers: headerMap(request),
					body,
				},
				deps,
			);
		response.writeHead(result.status, result.headers);
		response.end(result.body);
		// Never log bodies: they hold passport photos and model answers.
		const seconds = ((Date.now() - started) / 1000).toFixed(1);
		process.stdout.write(
			`${request.method} ${path} ${result.status} ${seconds}s\n`,
		);
	});
	server.requestTimeout = JOB_TIMEOUT_MS + 60_000;
	server.on("error", (error: NodeJS.ErrnoException) => {
		process.stderr.write(
			error.code === "EADDRINUSE"
				? `Port ${port} is in use. Is voyput-local already running? Try --port.\n`
				: `${error.message}\n`,
		);
		process.exit(1);
	});
	server.listen(port, "127.0.0.1", () => {
		process.stdout.write(
			[
				`voyput-local ${VERSION} on http://127.0.0.1:${port} (this computer only)`,
				`Engines: ${engines.length ? engines.join(", ") : "none found. Install Codex CLI or Claude Code, log in, restart."}`,
				"",
				"Pair voyput with this server: open",
				`  ${pairingLink(token, port)}`,
				`or paste this token in Settings → AI → Local: ${token}`,
				"",
				"Photos go only to the CLI's own provider (OpenAI or Anthropic) under your account.",
				"Ctrl+C stops.",
				"",
			].join("\n"),
		);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main();
