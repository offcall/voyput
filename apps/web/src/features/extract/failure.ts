/** A failed extraction told in plain words, with the stored detail kept apart. */
export interface FailureText {
	/** What happened and what the user can do. */
	summary: string;
	/** The first line of the stored message, for the curious and for bug reports. */
	detail: string;
}

const RULES: { test: RegExp; summary: string }[] = [
	{
		test: /^invalid model output/,
		summary:
			"The AI answered, but its answer could not be read. Retry, or add the stamps by hand in Review.",
	},
	{
		test: /check your OpenRouter key/,
		summary: "OpenRouter refused your key. Check it in Settings, then retry.",
	},
	{
		test: /out of credits/,
		summary:
			"Your OpenRouter account is out of credits. Add credits, then retry.",
	},
	{
		test: /Rate limited by OpenRouter/,
		summary: "Rate limited by OpenRouter. Try again in a minute.",
	},
	{
		test: /stopped abnormally|returned no text/,
		summary:
			"The AI stopped before it finished. Retry, or add the stamps by hand in Review.",
	},
	{
		test: /timeout|timed out|aborted/i,
		summary: "The AI took too long to answer. Retry later.",
	},
	{
		test: /^OpenRouter error/,
		summary: "The AI service had a problem. Retry in a moment.",
	},
	{
		test: /failed to fetch|network/i,
		summary: "Could not reach OpenRouter. Check your connection, then retry.",
	},
];

export function describeFailure(notes: string): FailureText {
	const detail = notes.split("\n")[0]?.trim() ?? "";
	const rule = RULES.find(({ test }) => test.test(detail));
	return {
		summary:
			rule?.summary ??
			"Reading this photo failed. Retry, or add the stamps by hand in Review.",
		detail,
	};
}
