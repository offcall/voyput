import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, transformWithOxc } from "vite";

const LOCAL_SOURCE = new URL(
	"../../packages/local/src/voyput-local.ts",
	import.meta.url,
);
const LOCAL_FILE = "voyput-local.mjs";

/** voyput-local as the one plain JavaScript file the site serves (ADR 0026). */
const localScript = async () =>
	(
		await transformWithOxc(readFileSync(LOCAL_SOURCE, "utf8"), LOCAL_FILE, {
			lang: "ts",
		})
	).code;

/** Serves the local AI engine as one plain JavaScript file (ADR 0026). */
function localEngineScript(): Plugin {
	return {
		name: "voyput-local-script",
		configureServer(server) {
			server.middlewares.use(`/${LOCAL_FILE}`, (_request, response, next) => {
				localScript().then((code) => {
					response.setHeader("content-type", "text/javascript; charset=utf-8");
					response.end(code);
				}, next);
			});
		},
		async generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: LOCAL_FILE,
				source: await localScript(),
			});
		},
	};
}

const EXPORT_SOURCE = new URL(
	"../../tools/photos-export/photo-locations.sh",
	import.meta.url,
);
const EXPORT_FILE = "photo-locations.sh";

const exportScript = () => readFileSync(EXPORT_SOURCE, "utf8");

/** Serves the photo locations export (ADR 0033). */
function photoExportScript(): Plugin {
	return {
		name: "photo-export-script",
		configureServer(server) {
			server.middlewares.use(`/${EXPORT_FILE}`, (_request, response) => {
				response.setHeader("content-type", "text/plain; charset=utf-8");
				response.end(exportScript());
			});
		},
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: EXPORT_FILE,
				source: exportScript(),
			});
		},
	};
}

const HASHES_ID = "virtual:script-hashes";
const sha256 = (text: string) =>
	createHash("sha256").update(text, "utf8").digest("hex");

/**
 * `virtual:script-hashes`: the SHA-256 of each served script, exactly the
 * bytes the two plugins above serve and emit, for the download-verify-run
 * commands (ADR 0035).
 */
export function scriptHashes(): Plugin {
	const resolved = `\0${HASHES_ID}`;
	return {
		name: "script-hashes",
		resolveId: (id) => (id === HASHES_ID ? resolved : null),
		async load(id) {
			if (id !== resolved) return null;
			this.addWatchFile(fileURLToPath(LOCAL_SOURCE));
			this.addWatchFile(fileURLToPath(EXPORT_SOURCE));
			const hashes = {
				[LOCAL_FILE]: sha256(await localScript()),
				[EXPORT_FILE]: sha256(exportScript()),
			};
			return `export default ${JSON.stringify(hashes)};`;
		},
	};
}

export default defineConfig({
	plugins: [react(), localEngineScript(), photoExportScript(), scriptHashes()],
	// The parse worker loads the outlines chunk the main-thread fallback uses (ADR 0040).
	worker: { format: "es" },
	// Licence texts of the npm packages in the client bundle (THIRD_PARTY.md).
	build: { license: { fileName: "third-party-licenses.txt" } },
});
