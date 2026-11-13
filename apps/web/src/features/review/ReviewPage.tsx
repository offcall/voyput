import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Stamp } from "@voyput/core";
import { Button, Progress, Tabs } from "@voyput/ui";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "../../db/DbContext";
import { errorMessage } from "./format";
import { PhotoReview } from "./PhotoReview";
import {
	DEFAULT_UI_STATE,
	loadUiState,
	type ReviewUiState,
	restoreStamp,
	saveUiState,
} from "./reviewStore";
import type { Validation } from "./StampCard";
import { TimelineView } from "./TimelineView";
import { useLocationHistory, useReviewRecords } from "./useReviewData";
import "./review.css";

const UNDO_MS = 6000;

/** A stamp opened from the timeline; `seq` re-focuses the same stamp twice. */
interface Focus {
	stampId: string;
	seq: number;
}

export function ReviewPage() {
	const db = useDb();
	const records = useReviewRecords();
	const history = useLocationHistory();
	const [ui, setUi] = useState<ReviewUiState | null>(null);
	const [uiError, setUiError] = useState<string | null>(null);
	const [deleted, setDeleted] = useState<Stamp | null>(null);
	/** Open tab and photo live in the URL (`?tab=timeline&photo=<id>`); an unknown photo falls back to the first. */
	const search = useSearch({ from: "/collect/$step" });
	const navigate = useNavigate({ from: "/collect/$step" });
	const currentId = search.photo ?? null;
	const setCurrentId = (photo: string) =>
		void navigate({ search: (s) => ({ ...s, photo }) });
	const [focus, setFocus] = useState<Focus | null>(null);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [validations, setValidations] = useState<Record<string, Validation>>(
		{},
	);

	useEffect(() => {
		loadUiState(db)
			.then(setUi)
			.catch((error: unknown) => setUiError(errorMessage(error)));
	}, [db]);
	useEffect(() => {
		if (!deleted) return;
		const timer = setTimeout(() => setDeleted(null), UNDO_MS);
		return () => clearTimeout(timer);
	}, [deleted]);

	const photoNames = useMemo(
		() => new Map(records.data?.photos.map((p) => [p.id, p.name]) ?? []),
		[records.data],
	);

	const updateUi = (patch: Partial<ReviewUiState>) => {
		const next = { ...(ui ?? DEFAULT_UI_STATE), ...patch };
		setUi(next);
		void saveUiState(db, next);
	};
	/** `replace` swaps the URL in place, for a link that already added a history entry. */
	const openStamp = (stamp: Stamp, replace = false) => {
		void navigate({
			search: { tab: "photos", photo: stamp.photoId },
			replace,
		});
		setExpanded((e) => ({ ...e, [stamp.id]: true }));
		setFocus((f) => ({ stampId: stamp.id, seq: (f?.seq ?? 0) + 1 }));
	};
	// A link from Extract names one stamp: open it once, then drop it from the URL.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the link or the data arrives.
	useEffect(() => {
		const stamp = search.stamp
			? records.data?.stamps.find((s) => s.id === search.stamp)
			: undefined;
		if (stamp) openStamp(stamp, true);
	}, [search.stamp, records.data]);
	const error = records.error ?? history.error ?? uiError;
	const stamps = records.data?.stamps ?? [];
	const reviewed = stamps.filter((s) => s.reviewed).length;

	return (
		<div className="review-page">
			{records.data && stamps.length > 0 ? (
				<div className="review-progress">
					<span className="review-progress-text">
						<strong>{reviewed}</strong>/{stamps.length} stamps reviewed
					</span>
					<Progress
						value={reviewed}
						max={stamps.length}
						label="Stamps reviewed"
					/>
				</div>
			) : null}
			{error ? (
				<p role="alert" className="review-error">
					Could not read the stored data: {error}
				</p>
			) : null}
			{!records.data || !history.data || !ui ? (
				error ? null : (
					<div className="review-loading" aria-busy="true">
						<span className="review-skeleton" />
						<span className="review-skeleton" />
						<span className="review-sr">Loading…</span>
					</div>
				)
			) : (
				<Tabs
					// Opening a stamp from the timeline starts over on the Photos tab; card
					// state and validate results live here, so the remount keeps them.
					key={focus?.seq ?? 0}
					value={search.tab ?? "photos"}
					onValueChange={(tab) =>
						void navigate({
							search: (s) => ({
								...s,
								tab: tab === "timeline" ? "timeline" : "photos",
							}),
						})
					}
					items={[
						{
							value: "photos",
							label: "Photos",
							content: (
								<PhotoReview
									records={records.data}
									index={history.data.index}
									dayRuns={history.data.dayRuns}
									filter={ui.filter}
									currentId={currentId}
									focusStampId={focus?.stampId ?? null}
									onFilter={(filter) => updateUi({ filter })}
									onSelect={setCurrentId}
									onDeleted={setDeleted}
									expanded={expanded}
									setExpanded={setExpanded}
									validations={validations}
									setValidations={setValidations}
								/>
							),
						},
						{
							value: "timeline",
							label: "Timeline",
							content: (
								<TimelineView
									dayRuns={history.data.dayRuns}
									index={history.data.index}
									stamps={records.data.stamps}
									photoNames={photoNames}
									windowDays={ui.timelineWindowDays}
									onWindowDays={(timelineWindowDays) =>
										updateUi({ timelineWindowDays })
									}
									onOpen={(stamp) => openStamp(stamp)}
								/>
							),
						},
					]}
				/>
			)}
			{deleted ? (
				<div className="review-toast" role="status">
					<span>
						Stamp deleted ({deleted.country ?? "unknown country"},{" "}
						{deleted.date ?? "no date"}).
					</span>
					<Button
						onClick={() =>
							void restoreStamp(db, deleted).then(() => setDeleted(null))
						}
					>
						Undo
					</Button>
				</div>
			) : null}
		</div>
	);
}
