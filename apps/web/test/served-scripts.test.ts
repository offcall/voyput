import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { transformWithOxc } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { scriptSha256, verifiedCommand } from "../src/app/servedScripts";

/** Vitest runs from the repository root. */
const EXPORT_SOURCE = resolve("tools/photos-export/photo-locations.sh");
const LOCAL_SOURCE = resolve("packages/local/src/voyput-local.ts");
const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");
const hasShasum = spawnSync("shasum", ["-v"]).status === 0;

let dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
	dirs = [];
});

describe("served scripts (ADR 0035)", () => {
	it("knows the SHA-256 of the files the site serves", async () => {
		expect(scriptSha256("photo-locations.sh")).toBe(
			sha256(readFileSync(EXPORT_SOURCE, "utf8")),
		);
		const local = await transformWithOxc(
			readFileSync(LOCAL_SOURCE, "utf8"),
			"voyput-local.mjs",
			{ lang: "ts" },
		);
		expect(scriptSha256("voyput-local.mjs")).toBe(sha256(local.code));
	});

	it("downloads, checks, then runs, in one line", () => {
		const hash = scriptSha256("voyput-local.mjs");
		expect(
			verifiedCommand(
				"https://voyput.example",
				"voyput-local.mjs",
				"node",
				" --port 5000",
			),
		).toBe(
			`curl -fsSLo voyput-local.mjs https://voyput.example/voyput-local.mjs && echo "${hash} *voyput-local.mjs" | shasum -a 256 -c - && node voyput-local.mjs --port 5000`,
		);
	});

	it("survives being copied from a page, where HTML collapses runs of spaces", () => {
		for (const [file, runner] of [
			["photo-locations.sh", "sh"],
			["voyput-local.mjs", "node"],
		] as const) {
			const command = verifiedCommand("https://voyput.example", file, runner);
			expect(command.replace(/\s+/g, " ")).toBe(command);
		}
	});

	/** Runs the export command with a `curl` that writes `served` instead. */
	function runWith(served: string) {
		const dir = mkdtempSync(join(tmpdir(), "voyput-verify-"));
		dirs.push(dir);
		const bin = join(dir, "bin");
		const source = join(dir, "served");
		writeFileSync(source, served);
		mkdirSync(bin);
		writeFileSync(join(bin, "curl"), `#!/bin/sh\ncp "${source}" "$2"\n`);
		chmodSync(join(bin, "curl"), 0o755);
		const command = verifiedCommand(
			"https://voyput.example",
			"photo-locations.sh",
			"sh",
		);
		return spawnSync("sh", ["-c", command], {
			cwd: dir,
			encoding: "utf8",
			env: { PATH: `${bin}:${process.env.PATH}`, HOME: dir },
		});
	}

	it.skipIf(!hasShasum)("runs the script only when it matches", () => {
		const tampered = runWith("echo TAMPERED\n");
		expect(tampered.status).not.toBe(0);
		expect(tampered.stdout).not.toContain("TAMPERED");

		const genuine = runWith(readFileSync(EXPORT_SOURCE, "utf8"));
		expect(genuine.stdout).toContain("photo-locations.sh: OK");
		// The real script ran: no Photos library in this empty home.
		expect(genuine.stderr).toMatch(/^photo-locations: /m);
	});
});
