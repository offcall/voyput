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
	const [currentId, setCurrentId] = useState<string | null>(null);
	const [focus, setFocus] = useState<Focus | null>(null);

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
	const openStamp = (stamp: Stamp) => {
		setCurrentId(stamp.photoId);
		setFocus((f) => ({ stampId: stamp.id, seq: (f?.seq ?? 0) + 1 }));
	};
	const error = records.error ?? history.error ?? uiError;
	const stamps = records.data?.stamps ?? [];
	const reviewed = stamps.filter((s) => s.reviewed).length;

	return (
		<div className="review-page">
			<header className="review-header">
				<div>
					<h1>Review</h1>
					<p className="review-muted">
						Check each stamp against its photo and your location history.
					</p>
				</div>
				{records.data && stamps.length > 0 ? (
					<div className="review-progress">
						<span>
							<strong>{reviewed}</strong> of {stamps.length} stamps reviewed.
						</span>
						<Progress
							value={reviewed}
							max={stamps.length}
							label="Stamps reviewed"
						/>
					</div>
				) : null}
			</header>
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
					// Opening a stamp from the timeline starts over on the Photos tab.
					key={focus?.seq ?? 0}
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
									onOpen={openStamp}
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
