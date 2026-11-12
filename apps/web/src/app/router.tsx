import {
	createRootRoute,
	createRoute,
	createRouter,
	type RouterHistory,
	redirect,
} from "@tanstack/react-router";
import { ExtractPage } from "../features/extract/ExtractPage";
import { ImportPage } from "../features/import/ImportPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { TripsPage } from "../features/trips/TripsPage";
import { VisualizePage } from "../features/visualize/VisualizePage";
import { SettingsPage } from "../settings/SettingsPage";
import { Layout } from "./Layout";

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	beforeLoad: () => {
		throw redirect({ to: "/import" });
	},
});

const page = <TPath extends string>(
	path: TPath,
	component: () => React.ReactNode,
) => createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
	indexRoute,
	page("/import", ImportPage),
	page("/extract", ExtractPage),
	page("/review", ReviewPage),
	page("/trips", TripsPage),
	page("/visualize", VisualizePage),
	page("/settings", SettingsPage),
]);

export function createAppRouter(history?: RouterHistory) {
	return createRouter({ routeTree, ...(history ? { history } : {}) });
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
