import { createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App } from "../src/app/App";
import { createAppRouter } from "../src/app/router";
import { VoyputDb } from "../src/db/db";

let dbCount = 0;

/** Renders the whole app at `path` with a fresh database. */
export function renderApp(path = "/", options: { db?: VoyputDb } = {}) {
	const db = options.db ?? new VoyputDb(`test-${++dbCount}`);
	const router = createAppRouter(
		createMemoryHistory({ initialEntries: [path] }),
	);
	const view = render(<App router={router} db={db} storage={localStorage} />);
	return { ...view, db, router };
}
