import { RouterProvider } from "@tanstack/react-router";
import { AiProvider } from "../ai/AiContext";
import type { AiClient } from "../ai/openrouter";
import { LocationsProvider } from "../data/locations";
import { DbProvider } from "../db/DbContext";
import type { VoyputDb } from "../db/db";
import { SettingsProvider } from "../settings/SettingsContext";
import type { createAppRouter } from "./router";

export interface AppProps {
	router: ReturnType<typeof createAppRouter>;
	db: VoyputDb;
	storage: Storage;
	ai: AiClient;
}

export function App({ router, db, storage, ai }: AppProps) {
	return (
		<DbProvider db={db}>
			<LocationsProvider>
				<SettingsProvider storage={storage}>
					<AiProvider client={ai}>
						<RouterProvider router={router} />
					</AiProvider>
				</SettingsProvider>
			</LocationsProvider>
		</DbProvider>
	);
}
