import {
	createRootRoute,
	createRoute,
	createRouter,
	type RouterHistory,
	redirect,
} from "@tanstack/react-router";
import { CollectPage } from "../features/collect/CollectPage";
import { findStep } from "../features/collect/steps";
import { findVizTab, firstVizTab } from "../features/visualize/tabs";
import { VisualizePage } from "../features/visualize/VisualizePage";
import { SettingsPage } from "../settings/SettingsPage";
import { Layout } from "./Layout";

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	beforeLoad: () => {
		throw redirect({ to: "/collect", replace: true });
	},
});

const page = <TPath extends string>(
	path: TPath,
	component: () => React.ReactNode,
) => createRoute({ getParentRoute: () => rootRoute, path, component });

export type ReviewTab = "photos" | "timeline";

/**
 * Review search params: the open tab, the photo in focus, and a stamp to open once
 * (links from Extract). Bad values are dropped.
 */
export interface ReviewSearch {
	tab?: ReviewTab;
	photo?: string;
	stamp?: string;
}

const validateReviewSearch = (
	search: Record<string, unknown>,
): ReviewSearch => ({
	...(search.tab === "photos" || search.tab === "timeline"
		? { tab: search.tab }
		: {}),
	...(typeof search.photo === "string" && search.photo
		? { photo: search.photo }
		: {}),
	...(typeof search.stamp === "string" && search.stamp
		? { stamp: search.stamp }
		: {}),
});

/**
 * Collect (ADR 0016): one layout for every step. It renders the step itself, so the
 * children only carry the step id and the trip id; `/collect` opens the first step
 * that is not done (the layout reads the database for that).
 */
const collectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/collect",
	component: CollectPage,
});
const collectIndexRoute = createRoute({
	getParentRoute: () => collectRoute,
	path: "/",
});
/** Any step; the Review search params ride along on every step and are kept by Review. */
const collectStepRoute = createRoute({
	getParentRoute: () => collectRoute,
	path: "$step",
	validateSearch: validateReviewSearch,
	beforeLoad: ({ params }) => {
		if (!findStep(params.step))
			throw redirect({ to: "/collect", replace: true });
	},
});
const collectTripRoute = createRoute({
	getParentRoute: () => collectRoute,
	path: "trips/$tripId",
});

/** URLs from before the wizard (ADR 0013) lead to their step, keeping params. */
const legacy = <TPath extends string>(
	path: TPath,
	step: "passports" | "extract" | "trips",
) =>
	createRoute({
		getParentRoute: () => rootRoute,
		path,
		beforeLoad: () => {
			throw redirect({
				to: "/collect/$step",
				params: { step },
				replace: true,
			});
		},
	});
const legacyReviewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/review",
	validateSearch: validateReviewSearch,
	beforeLoad: ({ search }) => {
		throw redirect({
			to: "/collect/$step",
			params: { step: "review" },
			search,
			replace: true,
		});
	},
});
const legacyTripRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/trips/$tripId",
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/collect/trips/$tripId",
			params: { tripId: params.tripId },
			replace: true,
		});
	},
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
	collectRoute.addChildren([
		collectIndexRoute,
		collectStepRoute,
		collectTripRoute,
	]),
	legacy("/import", "passports"),
	legacy("/extract", "extract"),
	legacyReviewRoute,
	legacy("/trips", "trips"),
	legacyTripRoute,
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
