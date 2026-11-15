import type { ReadStamp } from "@voyput/core";
import { Badge, Button, Disclosure, TextField } from "@voyput/ui";
import type { ReactNode } from "react";
import { CountryTag } from "./CountryTag";
import { directionIcon, errorMessage, formatDay } from "./format";

type RescanState =
	| { status: "idle" }
	| { status: "running" }
	| { status: "error"; message: string }
	| { status: "done"; found: ReadStamp[] };

/** One photo's hint and rescan result; the page keeps them per photo, so Next or a tab switch keeps them. */
export interface RescanEntry {
	hint: string;
	state: RescanState;
}

export const IDLE_RESCAN: RescanEntry = { hint: "", state: { status: "idle" } };

/** Reads the photo again for missed stamps, behind a disclosure; each find can be added or discarded. */
export function RescanPanel({
	entry,
	update,
	onRescan,
	onAccept,
	children,
}: {
	entry: RescanEntry;
	/** Changes this photo's entry, also after the page moved on. */
	update: (change: (entry: RescanEntry) => RescanEntry) => void;
	/** Missing when no AI key is set. */
	onRescan: ((hint: string) => Promise<ReadStamp[]>) | undefined;
	onAccept: (stamp: ReadStamp) => Promise<void>;
	/** Shown above the controls, e.g. why AI is unavailable. */
	children?: ReactNode;
}) {
	const { hint, state } = entry;
	const setHint = (next: string) => update((e) => ({ ...e, hint: next }));
	const setState = (change: (current: RescanState) => RescanState) =>
		update((e) => ({ ...e, state: change(e.state) }));

	const run = async () => {
		if (!onRescan) return;
		setState(() => ({ status: "running" }));
		try {
			const found = await onRescan(hint);
			setState(() => ({ status: "done", found }));
		} catch (error) {
			const message = errorMessage(error);
			setState(() => ({ status: "error", message }));
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
			<Disclosure summary="⋯ Missed a stamp?">
				{children}
				<div className="review-rescan-row">
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
				</div>
				{state.status === "error" ? (
					<p role="alert" className="review-error">
						{state.message}
					</p>
				) : null}
				{state.status === "done" ? (
					state.found.length === 0 ? (
						<p role="status" className="review-muted">
							No missed stamps found.
						</p>
					) : (
						<ul aria-label="Missed stamps" className="review-drafts">
							{state.found.map((stamp) => (
								<li
									key={`${stamp.date}-${stamp.countryCode}-${stamp.direction}-${stamp.dateText}`}
									className="review-draft"
								>
									<CountryTag code={stamp.countryCode} />
									<span className="review-draft-text">
										{directionIcon(stamp.direction)}{" "}
										{stamp.date ? formatDay(stamp.date) : "no date"} ·{" "}
										{stamp.country ?? "?"}
										{stamp.location ? ` · ${stamp.location}` : ""}
									</span>
									{stamp.problem ? (
										<Badge tone="bad">{stamp.problem}</Badge>
									) : null}
									<span className="review-draft-actions">
										<Button
											variant="primary"
											onClick={() =>
												void onAccept(stamp).then(() => drop(stamp))
											}
										>
											Add
										</Button>
										<Button onClick={() => drop(stamp)}>Discard</Button>
									</span>
								</li>
							))}
						</ul>
					)
				) : null}
			</Disclosure>
		</section>
	);
}
