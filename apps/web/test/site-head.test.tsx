import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	BRAND_LETTER,
	iconSvg,
	OG_PROMISE,
	OG_TITLE,
} from "../../../scripts/brand/art";
import { cspHash, inlineScripts } from "../../../scripts/csp-hash";
import { BrandMark } from "../src/app/icons";

/** apps/web; jsdom's `URL` does not resolve file URLs, so paths are joined. */
const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");
const publicFile = (path: string) => join(WEB, "public", path);

const html = read("index.html");
const deploy = read("../../docs/deploy.md");

/** Every Content-Security-Policy value written in docs/deploy.md (nginx and `_headers`). */
const policies = [
	...deploy.matchAll(/Content-Security-Policy:? "?([^"\n]+)"?/g),
].map(([, value]) => value ?? "");

describe("Content-Security-Policy in docs/deploy.md", () => {
	it("is written for nginx and for _headers", () => {
		expect(policies).toHaveLength(2);
		expect(policies[0]).toBe(policies[1]);
	});

	it("allows the inline theme script of index.html by its current hash", () => {
		const scripts = inlineScripts(html);
		expect(scripts).toHaveLength(1);
		const hash = cspHash(scripts[0] ?? "");
		for (const policy of policies)
			expect(policy).toMatch(
				new RegExp(`script-src 'self' ${hash.replace(/[+/]/g, "\\$&")};`),
			);
	});

	it("needs no inline styles: index.html has no <style> and no style attribute", () => {
		expect(html).not.toMatch(/<style[\s>]/i);
		expect(html).not.toMatch(/\sstyle=/i);
		for (const policy of policies) {
			expect(policy).toContain("style-src 'self';");
			expect(policy).not.toContain("unsafe-inline");
		}
	});

	it("lets the app reach OpenRouter and voyput-local on 127.0.0.1 only", () => {
		for (const policy of policies)
			expect(policy).toContain(
				"connect-src 'self' https://openrouter.ai http://127.0.0.1:*;",
			);
	});
});

describe("favicon, manifest and share image", () => {
	it("draws the favicon with the sidebar brand mark's letter", () => {
		const { container } = render(<BrandMark />);
		const letter = [...container.querySelectorAll("path")].at(-1);
		expect(letter?.getAttribute("d")).toBe(BRAND_LETTER);
		expect(readFileSync(publicFile("/favicon.svg"), "utf8")).toBe(iconSvg(32));
	});

	it("links only files that exist in public/", () => {
		const links = [
			...html.matchAll(/(?:href|content)="(?:https:\/\/[^/"]+)?(\/[^"]+)"/g),
		].map(([, path]) => path ?? "");
		expect(links).toEqual(
			expect.arrayContaining([
				"/favicon.ico",
				"/favicon.svg",
				"/apple-touch-icon.png",
				"/manifest.webmanifest",
				"/og.png",
				"/boot.css",
			]),
		);
		for (const path of links.filter((link) => link !== "/"))
			expect(existsSync(publicFile(path)), path).toBe(true);
	});

	it("has a manifest whose icons exist", () => {
		const manifest = JSON.parse(
			readFileSync(publicFile("/manifest.webmanifest"), "utf8"),
		) as { start_url: string; display: string; icons: { src: string }[] };
		expect(manifest.start_url).toBe("/");
		expect(manifest.display).toBe("standalone");
		for (const icon of manifest.icons)
			expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
	});

	it("says what the home page says: its title and the BYOK promise", () => {
		const home = read("src/features/home/HomePage.tsx").replace(/\s+/g, " ");
		expect(home).toContain(OG_TITLE.join(" "));
		for (const phrase of OG_PROMISE.split(" · "))
			expect(home).toContain(phrase);
		expect(html).toContain(
			"Bring your own key. Your data stays in your browser.",
		);
	});
});
