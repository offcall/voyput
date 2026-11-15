/**
 * Request signing and encryption for voyput-local (ADR 0026). The pairing
 * token never leaves the browser: each request carries an HMAC-SHA256 made with
 * it over method, path, time, a fresh nonce and the body hash; the photo and
 * the answer are AES-256-GCM messages under a key derived from it (HKDF-SHA256),
 * bound to that request; /health answers with an HMAC proof. Same text as
 * `packages/local/src/voyput-local.ts`.
 */

export const AUTH_HEADER = "X-Voyput-Auth";

const encoder = new TextEncoder();

const base64 = (bytes: Uint8Array): string => {
	let binary = "";
	const chunk = 0x8000;
	for (let start = 0; start < bytes.length; start += chunk)
		binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
	return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
	Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

const base64Url = (bytes: Uint8Array): string => {
	return base64(bytes)
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
		"voyput-local/3 request",
		method,
		path,
		timestamp,
		nonce,
		bodyHash,
	]);
	return { header: `v3.${timestamp}.${nonce}.${bodyHash}.${mac}`, nonce };
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
		"voyput-local/3 response",
		nonce,
		await sha256Hex(content),
	]);
	return expected === proof;
}

/** The AES-256-GCM key both sides derive from the token. */
export async function sealKey(token: string): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey(
		"raw",
		encoder.encode(token),
		"HKDF",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: encoder.encode("voyput-local/3"),
			info: encoder.encode("aes-256-gcm"),
		},
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export const requestAad = (
	method: string,
	path: string,
	timestamp: string,
	nonce: string,
) => ["voyput-local/3 request", method, path, timestamp, nonce].join("\n");

export const responseAad = (nonce: string) =>
	["voyput-local/3 response", nonce].join("\n");

/** An AES-256-GCM message: 12-byte IV and ciphertext with its tag, base64. */
export interface Sealed {
	iv: string;
	data: string;
}

export async function seal(
	key: CryptoKey,
	plaintext: string,
	aad: string,
): Promise<Sealed> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const data = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
		key,
		encoder.encode(plaintext),
	);
	return { iv: base64(iv), data: base64(new Uint8Array(data)) };
}

/** The plaintext, or null when the message is malformed, forged or bound to other data. */
export async function unseal(
	key: CryptoKey,
	value: unknown,
	aad: string,
): Promise<string | null> {
	if (
		value === null ||
		typeof value !== "object" ||
		!("iv" in value) ||
		!("data" in value) ||
		typeof value.iv !== "string" ||
		typeof value.data !== "string"
	)
		return null;
	try {
		const plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: fromBase64(value.iv),
				additionalData: encoder.encode(aad),
			},
			key,
			fromBase64(value.data),
		);
		return new TextDecoder().decode(plaintext);
	} catch {
		return null;
	}
}
