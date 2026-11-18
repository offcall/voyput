import { Button, Dialog } from "@voyput/ui";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useLiveQuery } from "../../data/useLiveQuery";
import { useDb } from "../../db/DbContext";
import { focusStoredLocations } from "../import/csv/locationLine";
import { useDemoLoaded } from "../import/demoLoaded";
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
	/**
	 * Loads the demo data. When demo data is stored already it first asks to replace
	 * it (review edits on demo stamps are lost); resolves true once loaded.
	 */
	load: () => Promise<boolean>;
	/** Asks, then removes the demo data; resolves true once removed. */
	remove: () => Promise<boolean>;
}

type Confirming = {
	action: "replace" | "remove";
	resolve: (done: boolean) => void;
};

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

	const [confirming, setConfirming] = useState<Confirming | null>(null);
	const confirmingRef = useRef<Confirming | null>(null);
	const ask = useCallback(
		(action: Confirming["action"]) =>
			new Promise<boolean>((resolve) => {
				confirmingRef.current?.resolve(false);
				const next = { action, resolve };
				confirmingRef.current = next;
				setConfirming(next);
			}),
		[],
	);
	const answer = (confirmed: boolean) => {
		const current = confirmingRef.current;
		confirmingRef.current = null;
		setConfirming(null);
		if (!current) return;
		if (!confirmed) return current.resolve(false);
		void run(current.action === "remove" ? "remove" : "load").then(
			current.resolve,
		);
	};

	const value = useMemo(
		() => ({
			hasDemo,
			state,
			load: async () =>
				(await hasDemoData(db)) ? ask("replace") : run("load"),
			remove: () => ask("remove"),
		}),
		[db, hasDemo, state, run, ask],
	);
	const replace = confirming?.action === "replace";
	return (
		<DemoActionsContext.Provider value={value}>
			{children}
			<Dialog
				open={confirming !== null}
				onOpenChange={(open) => {
					if (!open) answer(false);
				}}
				title={replace ? "Replace demo data?" : "Remove demo data?"}
				actions={
					<>
						<Button onClick={() => answer(false)}>Cancel</Button>
						<Button
							variant={replace ? "primary" : "danger"}
							onClick={() => answer(true)}
						>
							{replace ? "Replace" : "Remove"}
						</Button>
					</>
				}
			>
				<p>
					{replace
						? "The demo passports, their pages and stamps and the demo photo locations are loaded again; review edits on demo stamps and stamps added to demo pages are lost. "
						: "The demo passports, their pages and stamps and the demo photo locations are deleted. "}
					Stays built on demo stamps are deleted too. Your own passports, photos
					and photo locations stay.
				</p>
			</Dialog>
		</DemoActionsContext.Provider>
	);
}

export function useDemoActions(): DemoActions {
	const actions = useContext(DemoActionsContext);
	if (!actions) throw new Error("useDemoActions needs a DemoActionsProvider");
	return actions;
}
