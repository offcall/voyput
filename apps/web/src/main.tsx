import "@voyput/ui/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createAppRouter } from "./app/router";
import { VoyputDb } from "./db/db";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
	<StrictMode>
		<App
			router={createAppRouter()}
			db={new VoyputDb()}
			storage={localStorage}
		/>
	</StrictMode>,
);
