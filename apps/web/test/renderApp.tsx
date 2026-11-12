import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { AiClient } from "../src/ai/openrouter";
import { App } from "../src/app/App";
import { createAppRouter } from "../src/app/router";
import { VoyputDb } from "../src/db/db";

let dbCount = 0;

/** Default AI stub: no model calls, and the model list is unavailable. */
export const offlineAi: AiClient = {
	askAboutImage: () => Promise.reject(new Error("no AI in tests")),
	listImageModels: () => Promise.reject(new Error("no network in tests")),
};

/** Renders the whole app at `path` with a fresh database. */
export function renderApp(
	path = "/",
	options: { db?: VoyputDb; ai?: AiClient } = {},
) {
	const db = options.db ?? new VoyputDb(`test-${++dbCount}`);
	const router = createAppRouter(
		createMemoryHistory({ initialEntries: [path] }),
	);
	const view = render(
		<App
			router={router}
			db={db}
			storage={localStorage}
			ai={options.ai ?? offlineAi}
		/>,
	);
	return { ...view, db, router };
}
