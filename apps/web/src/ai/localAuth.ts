/**
 * Request signing for voyput-local (ADR 0026). The pairing token never leaves
 * the browser: each request carries an HMAC-SHA256 made with it over method,
 * path, time, a fresh nonce and the body hash, and each answer carries an HMAC
 * proving the server knows the token. Same text as
 * `packages/local/src/voyput-local.ts`.
 */

export const AUTH_HEADER = "X-Voyput-Auth";

const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
};

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function hmac(token: string, lines: readonly string[]): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(token),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(lines.join("\n")),
	);
	return base64Url(new Uint8Array(mac));
}

export const randomNonce = (): string =>
	base64Url(crypto.getRandomValues(new Uint8Array(18)));

/** The `X-Voyput-Auth` value for one request, and its nonce. */
export async function signRequest(
	token: string,
	method: string,
	path: string,
	body: string,
	now: number = Date.now(),
	nonce: string = randomNonce(),
): Promise<{ header: string; nonce: string }> {
	const timestamp = String(now);
	const bodyHash = await sha256Hex(body);
	const mac = await hmac(token, [
		"voyput-local/2 request",
		method,
		path,
		timestamp,
		nonce,
		bodyHash,
	]);
	return { header: `v2.${timestamp}.${nonce}.${bodyHash}.${mac}`, nonce };
}

/** True when `proof` shows the server knows the token for this nonce and content. */
export async function proofMatches(
	token: string,
	nonce: string,
	content: string,
	proof: unknown,
): Promise<boolean> {
	if (typeof proof !== "string") return false;
	const expected = await hmac(token, [
		"voyput-local/2 response",
		nonce,
		await sha256Hex(content),
	]);
	return expected === proof;
}
