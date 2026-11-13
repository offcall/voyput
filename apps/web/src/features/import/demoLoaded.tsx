import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import type { DemoLoaded } from "./csv/CsvImport";

interface DemoLoadedState {
	/** Latest demo load, or null once demo data is removed. */
	demoLoaded: DemoLoaded | null;
	setDemoLoaded: (loaded: DemoLoaded | null) => void;
}

const DemoLoadedContext = createContext<DemoLoadedState>({
	demoLoaded: null,
	setDemoLoaded: () => undefined,
});

/**
 * Carries a demo load from the passports step (where the demo card is) to the
 * locations step, which reports it beside the location summary.
 */
export function DemoLoadedProvider({ children }: { children: ReactNode }) {
	const [demoLoaded, setDemoLoaded] = useState<DemoLoaded | null>(null);
	const value = useMemo(() => ({ demoLoaded, setDemoLoaded }), [demoLoaded]);
	return (
		<DemoLoadedContext.Provider value={value}>
			{children}
		</DemoLoadedContext.Provider>
	);
}

export const useDemoLoaded = () => useContext(DemoLoadedContext);
