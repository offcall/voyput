import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no scrolling; the router calls this on every navigation.
window.scrollTo = () => {};

afterEach(() => {
	cleanup();
	localStorage.clear();
});
