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
import { findVizTab, firstVizTab } from "../features/visualize/tabs";
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

export type ReviewTab = "photos" | "timeline";

/** Review search params: the open tab and the photo in focus. Bad values are dropped. */
export interface ReviewSearch {
	tab?: ReviewTab;
	photo?: string;
}

const reviewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/review",
	component: ReviewPage,
	validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
		...(search.tab === "photos" || search.tab === "timeline"
			? { tab: search.tab }
			: {}),
		...(typeof search.photo === "string" && search.photo
			? { photo: search.photo }
			: {}),
	}),
});

/** Trips stays mounted while the selected trip changes; the children only carry the id. */
const tripsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/trips",
	component: TripsPage,
});
const tripsIndexRoute = createRoute({
	getParentRoute: () => tripsRoute,
	path: "/",
});
const tripRoute = createRoute({
	getParentRoute: () => tripsRoute,
	path: "$tripId",
});

/** Visualize stays mounted while the tab changes: data and the trip filter survive the switch. */
const visualizeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/visualize",
	component: VisualizePage,
});
const toFirstVizTab = () =>
	redirect({
		to: "/visualize/$tab",
		params: { tab: firstVizTab().id },
		replace: true,
	});
const visualizeIndexRoute = createRoute({
	getParentRoute: () => visualizeRoute,
	path: "/",
	beforeLoad: () => {
		throw toFirstVizTab();
	},
});
const visualizeTabRoute = createRoute({
	getParentRoute: () => visualizeRoute,
	path: "$tab",
	beforeLoad: ({ params }) => {
		if (!findVizTab(params.tab)) throw toFirstVizTab();
	},
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	page("/import", ImportPage),
	page("/extract", ExtractPage),
	reviewRoute,
	tripsRoute.addChildren([tripsIndexRoute, tripRoute]),
	visualizeRoute.addChildren([visualizeIndexRoute, visualizeTabRoute]),
	page("/settings", SettingsPage),
]);

/**
 * Rewrites an old hash URL (`/#/trips?x=1` → `/trips?x=1`) in place, before the router reads
 * the location. Hash routes were used before ADR 0013.
 */
export function redirectLegacyHash(win: Pick<Window, "location" | "history">) {
	const { hash } = win.location;
	if (hash.startsWith("#/")) win.history.replaceState(null, "", hash.slice(1));
}

export function createAppRouter(history?: RouterHistory) {
	return createRouter({ routeTree, ...(history ? { history } : {}) });
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof createAppRouter>;
	}
}
