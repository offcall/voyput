import { RouterProvider } from "@tanstack/react-router";
import { DbProvider } from "../db/DbContext";
import type { VoyputDb } from "../db/db";
import { SettingsProvider } from "../settings/SettingsContext";
import type { createAppRouter } from "./router";

export interface AppProps {
	router: ReturnType<typeof createAppRouter>;
	db: VoyputDb;
	storage: Storage;
}

export function App({ router, db, storage }: AppProps) {
	return (
		<DbProvider db={db}>
			<SettingsProvider storage={storage}>
				<RouterProvider router={router} />
			</SettingsProvider>
		</DbProvider>
	);
}
