/**
 * Model trial: sends the Commons sample pages to OpenRouter models with the
 * app's real prompt, client and parser, then scores the answers against
 * groundTruth.ts. Costs real money; see docs/model-trial-2026-11.md.
 *
 *   node scripts/model-trial/run.mjs --env ../.env --out /tmp/trial \
 *     --models google/gemini-3.8-flash --pages sample-01.jpg,sample-02.jpg
 *
 * --dir reads the pages from another folder (same file names), e.g. the same
 * pages at another size.
 *
 * Answers are cached in --out: a rerun only asks for what is missing, and
 * without --pages it prints the table only. Spending stops before a call
 * could take the trial past --budget (USD, counted across reruns).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildStampPrompt, parsePhotoResponse } from "@voyput/core";
import { createOpenRouterClient } from "../../apps/web/src/ai/openrouter.ts";
import { GROUND_TRUTH } from "./groundTruth.ts";
import { addScores, EMPTY_SCORE, type PageScore, scorePage } from "./score.ts";

const DEMO_DIR = join(import.meta.dirname, "../../apps/web/public/demo");
/** The sample pages carry no passport validity, so no date range is given. */
const RANGE = { from: null, to: null };
/** Assumed worst cost of one call until a model's first answer shows the real one. */
const FIRST_CALL_ESTIMATE = 0.08;

interface Answer {
	model: string;
	file: string;
	text: string | null;
	error: string | null;
	cost: number | null;
	seconds: number;
}

const { values } = parseArgs({
	options: {
		env: { type: "string", default: ".env" },
		out: { type: "string" },
		models: { type: "string" },
		pages: { type: "string", default: "" },
		budget: { type: "string", default: "0.5" },
		effort: { type: "string", default: "medium" },
		dir: { type: "string", default: DEMO_DIR },
	},
});
if (!values.out || !values.models)
	throw new Error("--out and --models are required");
const out = values.out;
const models = values.models.split(",");
const pages = values.pages ? values.pages.split(",") : [];
const budget = Number(values.budget);
const pagesDir = values.dir;
const efforts = ["low", "medium", "high"] as const;
const effort = (() => {
	const found = efforts.find((e) => e === values.effort);
	if (!found) throw new Error("--effort must be low, medium or high");
	return found;
})();
mkdirSync(out, { recursive: true });

/** Reads the key without ever printing it. */
const readKey = (path: string): string => {
	const line = readFileSync(path, "utf8")
		.split("\n")
		.find((l) => l.startsWith("OPENROUTER_API_KEY="));
	const key = line
		?.slice("OPENROUTER_API_KEY=".length)
		.trim()
		.replace(/^"|"$/g, "");
	if (!key) throw new Error(`no OPENROUTER_API_KEY in ${path}`);
	return key;
};

const answerPath = (model: string, file: string) =>
	join(out, `${model.replaceAll("/", "__")}__${file}.json`);
const readAnswer = (model: string, file: string): Answer | null =>
	existsSync(answerPath(model, file))
		? (JSON.parse(readFileSync(answerPath(model, file), "utf8")) as Answer)
		: null;

/** USD this key has used so far, as OpenRouter reports it. */
async function keyUsage(key: string): Promise<number> {
	const response = await fetch("https://openrouter.ai/api/v1/key", {
		headers: { Authorization: `Bearer ${key}` },
	});
	const body = (await response.json()) as { data?: { usage?: unknown } };
	if (typeof body.data?.usage !== "number")
		throw new Error("no key usage in response");
	return body.data.usage;
}

/**
 * Spend of the trial so far: the larger of the summed answer costs and the
 * key's usage since the first run (a failed call can cost without an answer).
 */
const ledgerPath = join(out, "ledger.json");
async function spent(key: string): Promise<number> {
	const usage = await keyUsage(key);
	if (!existsSync(ledgerPath))
		writeFileSync(ledgerPath, JSON.stringify({ baseline: usage }));
	const { baseline } = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
		baseline: number;
	};
	const answered = GROUND_TRUTH.flatMap((page) =>
		models.map((model) => readAnswer(model, page.file)?.cost ?? 0),
	).reduce((a, b) => a + b, 0);
	return Math.max(usage - baseline, answered);
}

const client = createOpenRouterClient({
	// Sample pages are upright JPEGs: send the file as is.
	encodeImage: async (blob) =>
		`data:image/jpeg;base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
});

async function ask(model: string, file: string, key: string): Promise<Answer> {
	const started = performance.now();
	const blob = new Blob([readFileSync(join(pagesDir, file))], {
		type: "image/jpeg",
	});
	const seconds = () => (performance.now() - started) / 1000;
	try {
		const answer = await client.askAboutImage(
			{ openRouterKey: key, model, reasoningEffort: effort },
			{
				system: buildStampPrompt(RANGE),
				text: `Photo filename: ${JSON.stringify(file)}`,
				image: { blob, rotation: 0 },
			},
		);
		return {
			model,
			file,
			text: answer.text,
			error: null,
			cost: answer.cost,
			seconds: seconds(),
		};
	} catch (error) {
		return {
			model,
			file,
			text: null,
			error: error instanceof Error ? error.message : String(error),
			cost: null,
			seconds: seconds(),
		};
	}
}

if (pages.length) {
	const key = readKey(values.env);
	for (const model of models) {
		for (const file of pages) {
			if (readAnswer(model, file)?.text) continue;
			const costs = GROUND_TRUTH.map(
				(p) => readAnswer(model, p.file)?.cost ?? 0,
			);
			const worst = Math.max(...costs) || FIRST_CALL_ESTIMATE;
			const before = await spent(key);
			if (before + worst * 1.5 > budget) {
				console.log(
					`budget: stop before ${model} ${file} (spent $${before.toFixed(4)})`,
				);
				break;
			}
			const answer = await ask(model, file, key);
			writeFileSync(
				answerPath(model, file),
				JSON.stringify(answer, null, "\t"),
			);
			console.log(
				`${model} ${file}: ${answer.error ? `ERROR ${answer.error.slice(0, 120)}` : "ok"} $${(answer.cost ?? 0).toFixed(4)} ${answer.seconds.toFixed(1)}s`,
			);
		}
	}
	console.log(`\nTrial spend so far: $${(await spent(key)).toFixed(4)}`);
}

// Report over the cached answers of the given models (and pages, if given).
const pct = (n: number, d: number) =>
	d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "–";
console.log(
	"\n| Model | Pages | Found | Missed | Extra | Country | Date | Direction | Parse failures | Cost | Avg s/page |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const model of models) {
	let total: PageScore = EMPTY_SCORE;
	let answered = 0;
	let failures = 0;
	let cost = 0;
	let seconds = 0;
	for (const page of GROUND_TRUTH) {
		if (pages.length && !pages.includes(page.file)) continue;
		const answer = readAnswer(model, page.file);
		if (!answer) continue;
		answered++;
		cost += answer.cost ?? 0;
		seconds += answer.seconds;
		let read: ReturnType<typeof parsePhotoResponse>["stamps"] = [];
		try {
			if (answer.text === null) throw new Error(answer.error ?? "no answer");
			read = parsePhotoResponse(answer.text, RANGE).stamps;
		} catch {
			failures++;
		}
		total = addScores(total, scorePage(page.stamps, read));
	}
	if (!answered) continue;
	console.log(
		`| ${model} | ${answered} | ${pct(total.found, total.required)} | ${total.required - total.found} | ${total.extra} | ${pct(total.countryCorrect, total.required)} | ${pct(total.dateCorrect, total.datesScored)} | ${pct(total.directionCorrect, total.directionsScored)} | ${failures} | $${cost.toFixed(4)} | ${(seconds / answered).toFixed(1)} |`,
	);
}
