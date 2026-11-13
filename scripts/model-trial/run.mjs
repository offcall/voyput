// Runs trial.ts through Vite, which resolves the workspace's TypeScript imports.
import { runnerImport } from "vite";

await runnerImport(new URL("./trial.ts", import.meta.url).pathname, {
	configFile: false,
	logLevel: "error",
});
