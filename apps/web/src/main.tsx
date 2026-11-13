import "@voyput/ui/styles.css";
import { createBrowserHistory } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createOpenRouterClient } from "./ai/openrouter";
import { App } from "./app/App";
import { createAppRouter, redirectLegacyHash } from "./app/router";
import { VoyputDb } from "./db/db";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

redirectLegacyHash(window);

createRoot(root).render(
	<StrictMode>
		<App
			router={createAppRouter(createBrowserHistory())}
			db={new VoyputDb()}
			storage={localStorage}
			ai={createOpenRouterClient()}
		/>
	</StrictMode>,
);
