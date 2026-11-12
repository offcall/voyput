import type { ReadStamp } from "@voyput/core";
import { Badge, Button, TextField } from "@voyput/ui";
import { useState } from "react";
import { directionIcon, errorMessage, flagOf } from "./format";

type RescanState =
	| { status: "idle" }
	| { status: "running" }
	| { status: "error"; message: string }
	| { status: "done"; found: ReadStamp[] };

/** Reads the photo again for missed stamps; each find can be added or discarded. */
export function RescanPanel({
	onRescan,
	onAccept,
}: {
	/** Missing when no AI key is set. */
	onRescan: ((hint: string) => Promise<ReadStamp[]>) | undefined;
	onAccept: (stamp: ReadStamp) => Promise<void>;
}) {
	const [hint, setHint] = useState("");
	const [state, setState] = useState<RescanState>({ status: "idle" });

	const run = async () => {
		if (!onRescan) return;
		setState({ status: "running" });
		try {
			setState({ status: "done", found: await onRescan(hint) });
		} catch (error) {
			setState({ status: "error", message: errorMessage(error) });
		}
	};
	const drop = (stamp: ReadStamp) =>
		setState((current) =>
			current.status === "done"
				? { ...current, found: current.found.filter((s) => s !== stamp) }
				: current,
		);

	return (
		<section className="review-rescan" aria-label="Rescan">
			<TextField
				label="Hint for the rescan"
				value={hint}
				onChange={setHint}
				placeholder="e.g. a faint stamp in the bottom left corner"
			/>
			<Button
				disabled={!onRescan || state.status === "running"}
				onClick={() => void run()}
			>
				{state.status === "running" ? "Rescanning…" : "Rescan with AI"}
			</Button>
			{state.status === "error" ? <p role="alert">{state.message}</p> : null}
			{state.status === "done" ? (
				state.found.length === 0 ? (
					<p role="status">No missed stamps found.</p>
				) : (
					<ul aria-label="Missed stamps">
						{state.found.map((stamp) => (
							<li
								key={`${stamp.date}-${stamp.countryCode}-${stamp.direction}-${stamp.dateText}`}
								className="review-draft"
							>
								{flagOf(stamp.countryCode)} {directionIcon(stamp.direction)}{" "}
								{stamp.date ?? "no date"} · {stamp.country ?? "?"}
								{stamp.location ? ` · ${stamp.location}` : ""}{" "}
								{stamp.problem ? (
									<Badge tone="bad">{stamp.problem}</Badge>
								) : null}{" "}
								<Button
									variant="primary"
									onClick={() => void onAccept(stamp).then(() => drop(stamp))}
								>
									Add
								</Button>{" "}
								<Button onClick={() => drop(stamp)}>Discard</Button>
							</li>
						))}
					</ul>
				)
			) : null}
		</section>
	);
}
