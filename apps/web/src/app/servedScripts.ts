import hashes from "virtual:script-hashes";

/** A script the site serves next to the app (ADR 0026, ADR 0033). */
export type ServedScript = keyof typeof hashes;

/** The SHA-256 (hex) of the script this build serves. */
export function scriptSha256(file: ServedScript): string {
	return hashes[file];
}

/**
 * One line that downloads `file` from `origin`, checks it against this build's
 * SHA-256 and only then runs it with `runner` (ADR 0035). `curl` and `shasum`
 * ship with macOS and most Linux systems.
 */
export function verifiedCommand(
	origin: string,
	file: ServedScript,
	runner: "sh" | "node",
	args = "",
): string {
	return `curl -fsSLo ${file} ${origin}/${file} && echo "${scriptSha256(file)}  ${file}" | shasum -a 256 -c - && ${runner} ${file}${args}`;
}
