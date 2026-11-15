/**
 * Records the README GIF (docs/media/voyput.gif) and its poster
 * (docs/media/voyput-poster.png): the real app in headless Chromium, walking
 * the whole flow on the demo data only (fictional traveller).
 *
 *   node scripts/readme-gif/record.mjs [--url http://127.0.0.1:5173/]
 *
 * Without --url it starts its own Vite (apps/web) on a free port and stops it
 * at the end. Every run starts from an empty browser profile.
 *
 * Needs: ffmpeg on PATH; playwright-core (resolved from the repo, or from the
 * PLAYWRIGHT_CORE env var: path to a playwright-core package); a Chromium
 * (CHROMIUM env var, else the newest chromium headless shell in
 * ~/.cache/ms-playwright).
 *
 * The AI step makes no real model call: requests to openrouter.ai are answered
 * in the page with the ground-truth stamps of apps/web/public/demo/demo.json,
 * and the key in Settings is a fake. The only network access is a one-time
 * download of the Noto Color Emoji flag subset from Google Fonts (cached in
 * scripts/readme-gif/.cache), because headless Chromium has no emoji font and
 * would draw the country flags as boxes. Temp output: scripts/readme-gif/.out.
 */

import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DEMO = join(ROOT, "apps/web/public/demo");
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, ".out");
const MEDIA = join(ROOT, "docs/media");
const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 980;
const GIF_FPS = 14;

// ---------------------------------------------------------------- setup

const loadPlaywright = () => {
	const require = createRequire(import.meta.url);
	const from = process.env.PLAYWRIGHT_CORE;
	try {
		return require(from ?? "playwright-core");
	} catch {
		throw new Error(
			"playwright-core not found: set PLAYWRIGHT_CORE to the path of a playwright-core package",
		);
	}
};

const findChromium = () => {
	if (process.env.CHROMIUM) return process.env.CHROMIUM;
	const base = join(homedir(), ".cache/ms-playwright");
	const dirs = existsSync(base)
		? readdirSync(base)
				.filter((name) => name.startsWith("chromium_headless_shell-"))
				.sort()
				.reverse()
		: [];
	for (const dir of dirs) {
		const path = join(
			base,
			dir,
			"chrome-headless-shell-linux64/chrome-headless-shell",
		);
		if (existsSync(path)) return path;
	}
	throw new Error("no Chromium found: set CHROMIUM to a Chromium executable");
};

const freePort = () =>
	new Promise((resolve, reject) => {
		const server = createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});

/** Starts Vite for apps/web; resolves with its URL and a stop function. */
const startVite = async () => {
	const port = await freePort();
	const vite = spawn(
		"npx",
		["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
		{
			cwd: join(ROOT, "apps/web"),
			stdio: ["ignore", "pipe", "pipe"],
			detached: true, // own process group, so stop() also ends the vite under npx
		},
	);
	await new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Vite did not start")),
			30_000,
		);
		vite.stdout.on("data", (chunk) => {
			if (String(chunk).includes(`:${port}`)) {
				clearTimeout(timer);
				resolve();
			}
		});
		vite.on("exit", (code) => reject(new Error(`Vite exited (${code})`)));
	});
	return {
		url: `http://127.0.0.1:${port}/`,
		stop: () => process.kill(-vite.pid),
	};
};

/** The flag glyphs (regional indicators) of Noto Color Emoji, or null when offline. */
const flagFont = async () => {
	const file = join(CACHE, "noto-color-emoji-flags.woff2");
	if (existsSync(file)) return readFileSync(file);
	try {
		const css = await (
			await fetch("https://fonts.googleapis.com/css2?family=Noto+Color+Emoji", {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0 Safari/537.36",
				},
			})
		).text();
		const block = css
			.split("@font-face")
			.find((face) => /unicode-range:\s*U\+1f1e6-1f1ff/i.test(face));
		const url = block?.match(/url\((https:[^)]+)\)/)?.[1];
		if (!url) throw new Error("no flag subset in the Google Fonts CSS");
		const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
		mkdirSync(CACHE, { recursive: true });
		writeFileSync(file, bytes);
		return bytes;
	} catch (error) {
		console.warn(
			`flags will show as boxes: ${error instanceof Error ? error.message : error}`,
		);
		return null;
	}
};

/** Ground-truth stamps per page file name, as the model's JSON would list them. */
const demoAnswers = () => {
	const demo = JSON.parse(readFileSync(join(DEMO, "demo.json"), "utf8"));
	const answers = new Map();
	for (const photo of demo.photos) {
		const stamps = demo.stamps
			.filter((stamp) => stamp.photoId === photo.id)
			.map(
				({
					direction,
					borderCrossing,
					dateText,
					date,
					country,
					countryCode,
					location,
					confidence,
					notes,
				}) => ({
					direction,
					borderCrossing,
					dateText,
					date,
					country,
					countryCode,
					location,
					confidence,
					notes,
				}),
			);
		answers.set(photo.name, { notes: "", stamps });
	}
	return answers;
};

// ---------------------------------------------------------------- in-page helpers

/** A visible cursor and click ripple (headless video shows no pointer), plus the flag font. */
function pageDecor(withFlags) {
	const css = `
		${withFlags ? '@font-face{font-family:"GifFlags";src:url(http://gif.invalid/flags.woff2) format("woff2");unicode-range:U+1F1E6-1F1FF}' : ""}
		:root{${withFlags ? '--vp-font:"Inter Variable","GifFlags",ui-sans-serif,system-ui,sans-serif !important;--vp-font-pixel:"Silkscreen","GifFlags",ui-monospace,monospace !important;' : ""}}
		#gif-cursor{position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;
			background:url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 2l15 11-6.5 1 3.8 7.2-2.6 1.3-3.8-7.3L4 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>')}") no-repeat;
			transform:translate(-3px,-2px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
		.gif-ripple{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;z-index:2147483646;pointer-events:none;
			border:3px solid #6fdc6f;background:rgba(111,220,111,.25);animation:gif-ripple .5s ease-out forwards}
		@keyframes gif-ripple{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}`;
	const install = () => {
		const style = document.createElement("style");
		style.textContent = css;
		document.head.appendChild(style);
		const cursor = document.createElement("div");
		cursor.id = "gif-cursor";
		cursor.style.left = "640px";
		cursor.style.top = "420px";
		document.body.appendChild(cursor);
		addEventListener(
			"mousemove",
			(event) => {
				cursor.style.left = `${event.clientX}px`;
				cursor.style.top = `${event.clientY}px`;
			},
			true,
		);
		addEventListener(
			"mousedown",
			(event) => {
				const ripple = document.createElement("div");
				ripple.className = "gif-ripple";
				ripple.style.left = `${event.clientX}px`;
				ripple.style.top = `${event.clientY}px`;
				document.body.appendChild(ripple);
				setTimeout(() => ripple.remove(), 600);
			},
			true,
		);
	};
	if (document.body) install();
	else addEventListener("DOMContentLoaded", install);
}

// ---------------------------------------------------------------- recording

const record = async (url, flags) => {
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch({ executablePath: findChromium() });
	rmSync(OUT, { recursive: true, force: true });
	mkdirSync(join(OUT, "frames"), { recursive: true });
	const context = await browser.newContext({
		viewport: VIEWPORT,
		colorScheme: "dark",
	});
	const page = await context.newPage();
	// Lossless frames, sent only when the screen changes: far smaller GIF than a
	// re-encoded video, whose codec noise changes every pixel of every frame.
	const frames = [];
	const cdp = await context.newCDPSession(page);
	cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
		const file = join(
			OUT,
			"frames",
			`${String(frames.length).padStart(5, "0")}.png`,
		);
		writeFileSync(file, Buffer.from(data, "base64"));
		frames.push({ file, at: metadata.timestamp ?? Date.now() / 1000 });
		cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
	});
	await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
	const marks = [];
	const mark = (name) => marks.push({ name, at: Date.now() / 1000 });
	const wait = (ms) => page.waitForTimeout(ms);

	page.on("pageerror", (error) => console.warn(`page error: ${error.message}`));
	await page.addInitScript(() => {
		localStorage.setItem("voyput:theme", "dark");
		localStorage.setItem(
			"voyput:settings",
			JSON.stringify({ openRouterKey: "sk-or-v1-fake-key-for-the-readme-gif" }),
		);
	});
	await page.addInitScript(pageDecor, flags !== null);
	if (flags)
		await page.route("http://gif.invalid/flags.woff2", (route) =>
			route.fulfill({ body: flags, contentType: "font/woff2" }),
		);

	const answers = demoAnswers();
	let answered = 0;
	await page.route("https://openrouter.ai/api/v1/**", async (route) => {
		const request = route.request();
		if (request.method() !== "POST")
			return route.fulfill({ json: { data: [] } });
		const text =
			request.postDataJSON()?.messages?.[1]?.content?.[0]?.text ?? "";
		const name = JSON.parse(text.replace(/^Photo filename: /, ""));
		const answer = answers.get(name);
		if (!answer) return route.abort();
		await new Promise((resolve) =>
			setTimeout(resolve, 450 + (answered++ % 3) * 200),
		);
		await route.fulfill({
			json: {
				choices: [
					{
						finish_reason: "stop",
						message: { role: "assistant", content: JSON.stringify(answer) },
					},
				],
				usage: { cost: 0.002 },
			},
		});
	});

	/** Glides the cursor to the element, then clicks it. */
	const click = async (locator, { pause = 150 } = {}) => {
		await locator.scrollIntoViewIfNeeded();
		const box = await locator.boundingBox();
		if (!box) throw new Error("click target is not visible");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
			steps: 14,
		});
		await wait(pause);
		await locator.click();
	};
	/** Glides the cursor over the element (for file pickers, which open no dialog here). */
	const point = async (locator) => {
		const box = await locator.boundingBox();
		if (!box) throw new Error("point target is not visible");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
			steps: 14,
		});
		await page.mouse.down();
		await page.mouse.up();
	};
	const smoothScroll = async (y) => {
		await page.evaluate(
			(top) => window.scrollTo({ top, behavior: "smooth" }),
			y,
		);
		await wait(700);
	};

	// 1. Home → Collect "Both".
	await page.goto(url);
	await page.getByRole("button", { name: /^Both/ }).waitFor();
	await wait(600);
	mark("home");
	await page.mouse.move(700, 450);
	await wait(400);
	await smoothScroll(420);
	await click(page.getByRole("button", { name: /^Both/ }));

	// 2. Passports: add one, then its ten page photos.
	const name = page.locator("main input[type=text]").first();
	await name.waitFor();
	mark("passports");
	await click(name);
	await name.pressSequentially("Demo passport", { delay: 25 });
	await click(page.getByRole("button", { name: /add passport/i }));
	const pages = page.locator("input[type=file]").first();
	await pages.waitFor({ state: "attached" });
	await wait(300);
	await point(page.getByText(/validity not set|0 photos/).first());
	await pages.setInputFiles(
		Array.from({ length: 10 }, (_, i) => join(DEMO, `page-${i + 1}.png`)),
	);
	await page.getByText("page-5.png").waitFor();
	await wait(1200);

	// 3. Photo locations.
	await click(page.getByRole("link", { name: /import your photo locations/i }));
	const csv = page.locator("input[type=file]").first();
	await csv.waitFor({ state: "attached" });
	mark("locations");
	await wait(300);
	await point(page.getByText(/drop photo_locations\.csv/i));
	await csv.setInputFiles(join(DEMO, "photo_locations.csv"));
	await page.getByText(/^Imported /).waitFor();
	await wait(1800);

	// 4. Extract with the faked model.
	await click(page.getByRole("link", { name: /read the stamps on/i }));
	await page.getByRole("button", { name: /^extract$/i }).waitFor();
	mark("extract");
	await wait(400);
	await click(page.getByRole("button", { name: /^extract$/i }));
	await page
		.getByRole("link", { name: /review \d+ stamps/i })
		.waitFor({ timeout: 30_000 });
	await wait(1000);

	// 5. Review: one stamp checked, marked, next.
	await click(page.getByRole("link", { name: /review \d+ stamps/i }));
	mark("skip");
	await page
		.getByRole("button", { name: /mark reviewed/i })
		.first()
		.waitFor();
	await page.locator("main img").first().waitFor();
	await wait(300);
	mark("review");
	await wait(900);
	const reviewed = page.getByRole("button", { name: /mark reviewed/i }).first();
	const box = await reviewed.boundingBox();
	await smoothScroll(
		Math.max(0, (box?.y ?? 0) + (await page.evaluate(() => scrollY)) - 520),
	);
	await click(reviewed);
	await wait(900);
	await click(page.getByRole("button", { name: /^next →$/i }).first());
	await wait(1000);

	// 6. Stays, then Insights: Journey at 16×, ending on the map.
	await page.evaluate(() => window.scrollTo({ top: 0 }));
	await click(page.getByRole("link", { name: /^stays$/i }).first());
	mark("skip");
	await page.getByText(/\d+ stays · \d+ countries/).waitFor();
	mark("stays");
	await wait(1600);
	await click(page.getByRole("link", { name: /^journey$/i }).first());
	mark("skip");
	await page.getByRole("button", { name: "16×" }).waitFor();
	await wait(200);
	mark("journey");
	await click(page.getByRole("button", { name: "16×" }), { pause: 80 });
	await page.mouse.move(1180, 560, { steps: 10 });
	await wait(6000);
	await page.screenshot({
		path: join(OUT, "poster.png"),
		style: "#gif-cursor{display:none}",
	});
	await wait(1300);
	await click(page.getByRole("link", { name: /^map$/i }).first());
	mark("skip");
	await page.getByText(/where you went/i).waitFor();
	await wait(300);
	mark("map");
	await page.mouse.move(1180, 760, { steps: 10 });
	await wait(1000);
	mark("end");

	await cdp.send("Page.stopScreencast");
	await context.close();
	await browser.close();
	if (frames.length === 0) throw new Error("no frames recorded");
	return { frames, poster: join(OUT, "poster.png"), marks };
};

// ---------------------------------------------------------------- GIF

/**
 * Speed-up per scene (recorded seconds / GIF seconds), tuned so the GIF stays
 * under 20 s. Scenes named "skip" (route chunks loading) are dropped.
 */
const SPEED = {
	home: 1.4,
	passports: 1.9,
	locations: 1.5,
	extract: 2.2,
	review: 1.9,
	stays: 1.3,
	journey: 1.9,
	map: 1,
};

/** Resamples the frames scene by scene to GIF_FPS, then palettes them into the GIF. */
const toGif = ({ frames, marks }) => {
	const parts = [];
	const picks = [];
	let next = 0;
	const frameAt = (time) => {
		while (next + 1 < frames.length && frames[next + 1].at <= time) next++;
		return frames[next].file;
	};
	for (let i = 0; i < marks.length - 1; i++) {
		const { name, at: start } = marks[i];
		const end = marks[i + 1].at;
		if (name === "skip") continue;
		const speed = SPEED[name] ?? 1;
		const count = Math.round(((end - start) / speed) * GIF_FPS);
		for (let k = 0; k < count; k++)
			picks.push(frameAt(start + (k / GIF_FPS) * speed));
		parts.push({ name, speed, seconds: count / GIF_FPS });
	}
	// One concat entry per run of equal frames.
	const lines = [];
	for (let i = 0; i < picks.length; ) {
		let j = i;
		while (j < picks.length && picks[j] === picks[i]) j++;
		lines.push(
			`file '${picks[i]}'`,
			`duration ${((j - i) / GIF_FPS).toFixed(4)}`,
		);
		i = j;
	}
	lines.push(`file '${picks.at(-1)}'`);
	const list = join(OUT, "frames.txt");
	writeFileSync(list, `${lines.join("\n")}\n`);
	const filter = [
		`fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b]`,
		"[a]palettegen=max_colors=192:stats_mode=diff[pal]",
		"[b][pal]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
	].join(";");
	mkdirSync(MEDIA, { recursive: true });
	const gif = join(MEDIA, "voyput.gif");
	const args = [
		"-y",
		"-loglevel",
		"error",
		"-f",
		"concat",
		"-safe",
		"0",
		"-i",
		list,
	];
	const run = spawnSync(
		"ffmpeg",
		[...args, "-filter_complex", filter, "-loop", "0", gif],
		{ stdio: "inherit" },
	);
	if (run.status !== 0) throw new Error("ffmpeg failed");
	return { gif, parts };
};

// ---------------------------------------------------------------- main

const urlArg = process.argv.indexOf("--url");
const vite = urlArg === -1 ? await startVite() : null;
try {
	const url = vite?.url ?? process.argv[urlArg + 1];
	const recording = await record(url, await flagFont());
	const { gif, parts } = toGif(recording);
	const poster = join(MEDIA, "voyput-poster.png");
	writeFileSync(poster, readFileSync(recording.poster));
	let total = 0;
	for (const part of parts) {
		total += part.seconds;
		console.log(
			`${part.name.padEnd(10)} ${part.seconds.toFixed(1)} s (×${part.speed})`,
		);
	}
	console.log(
		`total ${total.toFixed(1)} s · ${(statSync(gif).size / 1e6).toFixed(2)} MB · ${GIF_FPS} fps · ${gif}`,
	);
} finally {
	vite?.stop();
}
