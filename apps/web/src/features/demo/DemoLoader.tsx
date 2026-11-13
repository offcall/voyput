import {
	Button,
	Card,
	Dialog,
	Disclosure,
	Notice,
	PixelArt,
	PixelSky,
} from "@voyput/ui";
import { useState } from "react";
import { useDb } from "../../db/DbContext";
import { focusStoredLocations, locationLine } from "../import/csv/locationLine";
import {
	type DemoSummary,
	type FetchFile,
	hasDemoData,
	loadDemo,
	removeDemo,
} from "./loadDemo";
import { SAMPLE_CREDITS } from "./sampleCredits";
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

/**
 * One-click demo data: a fictional passport with reviewed stamps and matching
 * photo locations, plus real Commons stamp pages with unreviewed model output.
 */
export function DemoLoader({
	onLoaded,
	onRemoved,
}: {
	/** Called after a successful load, e.g. to report it beside the location summary. */
	onLoaded?: (summary: DemoSummary) => void;
	/** Called after demo data is removed, e.g. to drop that report again. */
	onRemoved?: () => void;
} = {}) {
	const db = useDb();
	const [state, setState] = useState<LoadState>({ kind: "idle" });
	const [confirming, setConfirming] = useState<Confirming>(null);

	const run = async (action: "load" | "remove") => {
		setConfirming(null);
		setState({ kind: "busy" });
		try {
			if (action === "load") {
				const summary = await loadDemo(db, fetchDemoFile);
				setState({ kind: "loaded", summary });
				onLoaded?.(summary);
				focusStoredLocations();
			} else {
				await removeDemo(db);
				setState({ kind: "removed" });
				onRemoved?.();
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
				<PixelSky height={104}>
					<PixelArt name="plane" scale={3} className="demo-plane" />
					<PixelArt name="passport" scale={4} className="demo-passport" />
					<PixelArt name="stamp" scale={3} className="demo-stamp" />
				</PixelSky>
			</div>
			<p className="demo-text">
				A fictional passport with stamps already read and reviewed, plus
				matching photo locations. Also 10 real stamp pages from Wikimedia
				Commons, read by Gemini but not reviewed, to try Review on. No API key
				needed.
			</p>
			<p className="demo-note">
				Demo passports and demo photo locations mix with your own data in
				Review, Trips and Visualize until you remove them.
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
			<p className="demo-note">
				Remove demo data deletes the demo passports, their stamps and the demo
				photo locations; your own data stays.
			</p>
			<LoadStatus state={state} />
			<Disclosure summary="Sample page credits (Wikimedia Commons)">
				<ul className="demo-credits">
					{SAMPLE_CREDITS.map((credit) => (
						<li key={credit.files}>
							{credit.files}: <a href={credit.url}>{credit.title}</a> by{" "}
							{credit.author}, <a href={credit.licenseUrl}>{credit.license}</a>;{" "}
							{credit.changes}.
						</li>
					))}
				</ul>
			</Disclosure>
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
						? "The demo passports, their pages and stamps and the demo photo locations are loaded again; review edits on demo stamps are lost. "
						: "The demo passports, their pages and stamps and the demo photo locations are deleted. "}
					Trips built on demo stamps are deleted too. Your own passports, photos
					and photo locations stay.
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
			const { photos, stamps, samples, locationSummary } = state.summary;
			return (
				<Notice tone="good" role="status">
					Loaded {photos} demo pages, {stamps} stamps and{" "}
					{locationLine(locationSummary)}. Plus {samples.pages} sample pages
					with {samples.stamps} stamps to review.
				</Notice>
			);
		}
	}
}
