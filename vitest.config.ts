import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		include: ["{apps,packages,tools}/*/test/**/*.test.{ts,tsx}"],
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		testTimeout: 10_000,
		// jsdom suites are CPU-heavy; leave cores for the rest of the host.
		maxWorkers: "50%",
	},
});
