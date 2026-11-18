import { useEffect, useState } from "react";
import { Button } from "./Button";

/**
 * A shell command to copy into a terminal: the text wraps anywhere (long
 * hashes and URLs never widen the page) and a Copy button sits top right.
 */
export function CommandBox({
	command,
	label = "Copy the command",
}: {
	command: string;
	/** Accessible name of the Copy button. */
	label?: string;
}) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);
	return (
		<div className="vp-command">
			<pre>
				<code>{command}</code>
			</pre>
			<Button
				size="sm"
				className="vp-command-copy"
				aria-label={label}
				onClick={() =>
					navigator.clipboard?.writeText(command).then(
						() => setCopied(true),
						() => setCopied(false),
					)
				}
			>
				{copied ? "Copied" : "Copy"}
			</Button>
		</div>
	);
}
