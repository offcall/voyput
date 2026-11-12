import { Button, Card } from "@voyput/ui";
import { useState } from "react";
import { useDb } from "../../db/DbContext";
import { type DemoSummary, type FetchFile, loadDemo } from "./loadDemo";

const fetchDemoFile: FetchFile = async (name) => {
	const response = await fetch(`${import.meta.env.BASE_URL}demo/${name}`);
	if (!response.ok) {
		throw new Error(`could not fetch ${name} (HTTP ${response.status})`);
	}
	return response.blob();
};

type LoadState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "done"; summary: DemoSummary }
	| { kind: "error"; message: string };

/** One-click demo data: a fictional passport, its stamps and matching locations. */
export function DemoLoader() {
	const db = useDb();
	const [state, setState] = useState<LoadState>({ kind: "idle" });

	const onLoad = async () => {
		setState({ kind: "busy" });
		try {
			setState({ kind: "done", summary: await loadDemo(db, fetchDemoFile) });
		} catch (error) {
			setState({
				kind: "error",
				message: `Could not load demo data: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	return (
		<Card title="Try it with demo data">
			<p>
				A fictional passport with stamps already read, plus matching location
				history. No API key needed. Loading again replaces the demo data only;
				your own passports stay.
			</p>
			<Button onClick={onLoad} disabled={state.kind === "busy"}>
				Load demo data
			</Button>
			<LoadStatus state={state} />
		</Card>
	);
}

function LoadStatus({ state }: { state: LoadState }) {
	switch (state.kind) {
		case "idle":
			return null;
		case "busy":
			return <p role="status">Loading demo data…</p>;
		case "error":
			return <p role="alert">{state.message}</p>;
		case "done": {
			const { photos, stamps, locations } = state.summary;
			return (
				<p role="status">
					Loaded {photos} demo pages, {stamps} stamps and {locations} locations.
				</p>
			);
		}
	}
}
