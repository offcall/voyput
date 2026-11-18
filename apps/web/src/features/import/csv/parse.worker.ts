/**
 * Web Worker: parses a location CSV and locates each row's country off the
 * main thread (ADR 0040). The logic is `handleParseMessage`.
 */
import { handleParseMessage } from "./parseLocations";

/** The worker global scope, as far as this worker uses it. */
const scope = self as unknown as {
	onmessage: ((event: MessageEvent) => void) | null;
	postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
	handleParseMessage(event.data).then((reply) => scope.postMessage(reply));
};
