import { Button, Card, Dialog, Notice } from "@voyput/ui";
import { useState } from "react";
import { useDb } from "../../db/DbContext";
import {
	type DemoSummary,
	type FetchFile,
	hasDemoData,
	loadDemo,
	removeDemo,
} from "./loadDemo";
import "./demo.css";

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
	| { kind: "loaded"; summary: DemoSummary }
	| { kind: "removed" }
	| { kind: "error"; message: string };

type Confirming = "replace" | "remove" | null;

/** One-click demo data: a fictional passport, its stamps and matching locations. */
export function DemoLoader() {
	const db = useDb();
	const [state, setState] = useState<LoadState>({ kind: "idle" });
	const [confirming, setConfirming] = useState<Confirming>(null);

	const run = async (action: "load" | "remove") => {
		setConfirming(null);
		setState({ kind: "busy" });
		try {
			if (action === "load") {
				setState({
					kind: "loaded",
					summary: await loadDemo(db, fetchDemoFile),
				});
			} else {
				await removeDemo(db);
				setState({ kind: "removed" });
			}
		} catch (error) {
			setState({
				kind: "error",
				message: `Demo data failed: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	};

	const onLoad = async () => {
		if (await hasDemoData(db)) setConfirming("replace");
		else await run("load");
	};

	return (
		<Card className="demo-card" title="Try it with demo data">
			<div className="demo-art" aria-hidden="true">
				<span className="demo-stamp" data-n="1">
					UA ← 10.08
				</span>
				<span className="demo-stamp" data-n="2">
					ES → 10.08
				</span>
				<span className="demo-stamp" data-n="3">
					MD ← 03.05
				</span>
			</div>
			<p className="demo-text">
				A fictional passport with stamps already read and reviewed, plus
				matching location history. No API key needed.
			</p>
			<p className="demo-note">
				Demo stamps and locations mix with your own data in Review, Trips and
				Visualize until you remove them.
			</p>
			<div className="demo-actions">
				<Button
					variant="primary"
					onClick={onLoad}
					disabled={state.kind === "busy"}
				>
					Load demo data
				</Button>
				<Button
					variant="ghost"
					onClick={() => setConfirming("remove")}
					disabled={state.kind === "busy"}
				>
					Remove demo data
				</Button>
			</div>
			<LoadStatus state={state} />
			<Dialog
				open={confirming !== null}
				onOpenChange={(open) => {
					if (!open) setConfirming(null);
				}}
				title={
					confirming === "replace" ? "Replace demo data?" : "Remove demo data?"
				}
				actions={
					<>
						<Button onClick={() => setConfirming(null)}>Cancel</Button>
						<Button
							variant={confirming === "remove" ? "danger" : "primary"}
							onClick={() => run(confirming === "remove" ? "remove" : "load")}
						>
							{confirming === "replace" ? "Replace" : "Remove"}
						</Button>
					</>
				}
			>
				<p>
					{confirming === "replace"
						? "Demo pages, stamps and locations are loaded again; review edits on demo stamps are lost. "
						: "Demo pages, stamps and locations are deleted. "}
					Trips built on demo stamps are deleted too. Your own passports, photos
					and locations stay.
				</p>
			</Dialog>
		</Card>
	);
}

function LoadStatus({ state }: { state: LoadState }) {
	switch (state.kind) {
		case "idle":
			return null;
		case "busy":
			return (
				<Notice tone="info" role="status">
					Working on demo data…
				</Notice>
			);
		case "error":
			return (
				<Notice tone="bad" role="alert">
					{state.message}
				</Notice>
			);
		case "removed":
			return <Notice role="status">Demo data removed.</Notice>;
		case "loaded": {
			const { photos, stamps, locations } = state.summary;
			return (
				<Notice tone="good" role="status">
					Loaded {photos} demo pages, {stamps} stamps and {locations} locations.
				</Notice>
			);
		}
	}
}
