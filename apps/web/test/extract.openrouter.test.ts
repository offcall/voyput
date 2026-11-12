import { describe, expect, it } from "vitest";
import { createOpenRouterClient } from "../src/ai/openrouter";

const settings = {
	openRouterKey: "sk-or-test",
	model: "openai/gpt-6-sol",
	reasoningEffort: "medium" as const,
};
const question = {
	system: "read stamps",
	text: "photo",
	image: { blob: new Blob(["x"]), rotation: 0 as const },
};

/** A client whose fetch answers with `responses` in order and records request bodies. */
function clientWith(...responses: Response[]) {
	const bodies: Record<string, unknown>[] = [];
	const client = createOpenRouterClient({
		encodeImage: async () => "data:image/png;base64,eA==",
		fetchImpl: async (_url, init) => {
			if (typeof init?.body === "string") bodies.push(JSON.parse(init.body));
			const next = responses.shift();
			if (!next) throw new Error("unexpected request");
			return next;
		},
	});
	return { client, bodies };
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status });
const completion = (content: string, finish_reason = "stop") => ({
	choices: [{ finish_reason, message: { content } }],
	usage: { cost: 0.002 },
});

describe("openrouter client", () => {
	it("returns the text and cost of a normal completion", async () => {
		const { client } = clientWith(json(completion('{"stamps":[]}')));
		expect(await client.askAboutImage(settings, question)).toEqual({
			text: '{"stamps":[]}',
			cost: 0.002,
		});
	});

	it("rejects a cut-off answer and an error inside a 200", async () => {
		await expect(
			clientWith(json(completion('{"sta', "length"))).client.askAboutImage(
				settings,
				question,
			),
		).rejects.toThrow(/finish reason: length/);
		await expect(
			clientWith(
				json({ error: { message: "provider timed out" } }),
			).client.askAboutImage(settings, question),
		).rejects.toThrow(/provider timed out/);
	});

	it("explains key and credit errors", async () => {
		await expect(
			clientWith(json({}, 401)).client.askAboutImage(settings, question),
		).rejects.toThrow(/check your OpenRouter key/);
		await expect(
			clientWith(json({}, 402)).client.askAboutImage(settings, question),
		).rejects.toThrow(/out of credits/);
	});

	it("retries a 400 once without reasoning and JSON mode", async () => {
		const { client, bodies } = clientWith(
			json({ error: { message: "unsupported parameter" } }, 400),
			json(completion("{}")),
		);
		expect((await client.askAboutImage(settings, question)).text).toBe("{}");
		expect(bodies[0]).toHaveProperty("response_format");
		expect(bodies[1]).not.toHaveProperty("response_format");
		expect(bodies[1]).not.toHaveProperty("reasoning");
	});

	it("lists only models that accept images", async () => {
		const { client } = clientWith(
			json({
				data: [
					{
						id: "a/vision",
						name: "Vision",
						architecture: { input_modalities: ["text", "image"] },
					},
					{
						id: "b/text",
						name: "Text",
						architecture: { input_modalities: ["text"] },
					},
					{ id: "c/broken" },
				],
			}),
		);
		expect(await client.listImageModels()).toEqual([
			{ id: "a/vision", name: "Vision" },
		]);
	});
});
