import "fake-indexeddb/auto";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// findBy*/waitFor give up after 1 s by default, too short on a loaded host;
// the per-test budget (testTimeout) still caps every test.
configure({ asyncUtilTimeout: 5_000 });

// jsdom has no scrolling; the router calls this on every navigation.
window.scrollTo = () => {};

afterEach(() => {
	cleanup();
	localStorage.clear();
});
