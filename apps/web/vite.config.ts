import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, transformWithOxc } from "vite";

const LOCAL_SOURCE = new URL(
	"../../packages/local/src/voyput-local.ts",
	import.meta.url,
);
const LOCAL_FILE = "voyput-local.mjs";

/** Serves the local AI engine as one plain JavaScript file (ADR 0026). */
function localEngineScript(): Plugin {
	const script = async () =>
		(
			await transformWithOxc(readFileSync(LOCAL_SOURCE, "utf8"), LOCAL_FILE, {
				lang: "ts",
			})
		).code;
	return {
		name: "voyput-local-script",
		configureServer(server) {
			server.middlewares.use(`/${LOCAL_FILE}`, (_request, response, next) => {
				script().then((code) => {
					response.setHeader("content-type", "text/javascript; charset=utf-8");
					response.end(code);
				}, next);
			});
		},
		async generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: LOCAL_FILE,
				source: await script(),
			});
		},
	};
}

const EXPORT_SOURCE = new URL(
	"../../tools/photos-export/photo-locations.sh",
	import.meta.url,
);
const EXPORT_FILE = "photo-locations.sh";

/** Serves the photo locations export for `curl … | sh` (ADR 0033). */
function photoExportScript(): Plugin {
	const script = () => readFileSync(EXPORT_SOURCE, "utf8");
	return {
		name: "photo-export-script",
		configureServer(server) {
			server.middlewares.use(`/${EXPORT_FILE}`, (_request, response) => {
				response.setHeader("content-type", "text/plain; charset=utf-8");
				response.end(script());
			});
		},
		generateBundle() {
			this.emitFile({ type: "asset", fileName: EXPORT_FILE, source: script() });
		},
	};
}

export default defineConfig({
	plugins: [react(), localEngineScript(), photoExportScript()],
});
