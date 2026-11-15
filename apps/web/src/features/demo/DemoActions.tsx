import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { useDb } from "../../db/DbContext";
import { focusStoredLocations } from "../import/csv/locationLine";
import { useDemoLoaded } from "../import/demoLoaded";
import { useLiveQuery } from "../import/photos/useLiveQuery";
import {
	type DemoSummary,
	type FetchFile,
	hasDemoData,
	loadDemo,
	removeDemo,
} from "./loadDemo";

const fetchDemoFile: FetchFile = async (name) => {
	const response = await fetch(`${import.meta.env.BASE_URL}demo/${name}`);
	if (!response.ok) {
		throw new Error(`could not fetch ${name} (HTTP ${response.status})`);
	}
	return response.blob();
};

export type DemoState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "loaded"; summary: DemoSummary }
	| { kind: "removed" }
	| { kind: "error"; message: string };

interface DemoActions {
	/** Demo passports are stored; undefined while reading. */
	hasDemo: boolean | undefined;
	/** The last load or remove in this Collect visit. */
	state: DemoState;
	/** Loads (or replaces) the demo data; resolves true when it worked. */
	load: () => Promise<boolean>;
	remove: () => Promise<boolean>;
}

const DemoActionsContext = createContext<DemoActions | null>(null);

/**
 * Loading and removing demo data, shared by the Sources choice (where the demo
 * starts) and the demo banner on Passports (where it is reported and removed).
 * Sits inside `DemoLoadedProvider`, which carries a load to the locations step.
 */
export function DemoActionsProvider({ children }: { children: ReactNode }) {
	const db = useDb();
	const { setDemoLoaded } = useDemoLoaded();
	const [state, setState] = useState<DemoState>({ kind: "idle" });
	const hasDemo = useLiveQuery(useCallback(() => hasDemoData(db), [db])).data;

	const run = useCallback(
		async (action: "load" | "remove") => {
			setState({ kind: "busy" });
			try {
				if (action === "load") {
					const summary = await loadDemo(db, fetchDemoFile);
					setState({ kind: "loaded", summary });
					setDemoLoaded({ summary: summary.locationSummary });
					focusStoredLocations();
				} else {
					await removeDemo(db);
					setState({ kind: "removed" });
					setDemoLoaded(null);
				}
				return true;
			} catch (error) {
				setState({
					kind: "error",
					message: `Demo data failed: ${error instanceof Error ? error.message : String(error)}`,
				});
				return false;
			}
		},
		[db, setDemoLoaded],
	);

	const value = useMemo(
		() => ({
			hasDemo,
			state,
			load: () => run("load"),
			remove: () => run("remove"),
		}),
		[hasDemo, state, run],
	);
	return (
		<DemoActionsContext.Provider value={value}>
			{children}
		</DemoActionsContext.Provider>
	);
}

export function useDemoActions(): DemoActions {
	const actions = useContext(DemoActionsContext);
	if (!actions) throw new Error("useDemoActions needs a DemoActionsProvider");
	return actions;
}
