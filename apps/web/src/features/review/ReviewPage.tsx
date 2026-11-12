import type { Stamp } from "@voyput/core";
import { Button, Card, Stack, Tabs } from "@voyput/ui";
import { useEffect, useState } from "react";
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

export function ReviewPage() {
	const db = useDb();
	const records = useReviewRecords();
	const history = useLocationHistory();
	const [ui, setUi] = useState<ReviewUiState | null>(null);
	const [uiError, setUiError] = useState<string | null>(null);
	const [deleted, setDeleted] = useState<Stamp | null>(null);

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

	const updateUi = (patch: Partial<ReviewUiState>) => {
		const next = { ...(ui ?? DEFAULT_UI_STATE), ...patch };
		setUi(next);
		void saveUiState(db, next);
	};
	const error = records.error ?? history.error ?? uiError;

	return (
		<Stack>
			<h1>Review</h1>
			{error ? (
				<p role="alert">Could not read the stored data: {error}</p>
			) : null}
			{!records.data || !history.data || !ui ? (
				error ? null : (
					<p>Loading…</p>
				)
			) : (
				<>
					<p>
						{records.data.stamps.filter((s) => s.reviewed).length} of{" "}
						{records.data.stamps.length} stamps reviewed.
					</p>
					<Tabs
						items={[
							{
								value: "photos",
								label: "Photos",
								content: (
									<PhotoReview
										records={records.data}
										index={history.data.index}
										filter={ui.filter}
										onFilter={(filter) => updateUi({ filter })}
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
										stamps={records.data.stamps}
										windowDays={ui.timelineWindowDays}
										onWindowDays={(timelineWindowDays) =>
											updateUi({ timelineWindowDays })
										}
									/>
								),
							},
						]}
					/>
				</>
			)}
			{deleted ? (
				<Card>
					<div className="review-toast" role="status">
						Stamp deleted ({deleted.country ?? "unknown country"},{" "}
						{deleted.date ?? "no date"}).{" "}
						<Button
							onClick={() =>
								void restoreStamp(db, deleted).then(() => setDeleted(null))
							}
						>
							Undo
						</Button>
					</div>
				</Card>
			) : null}
		</Stack>
	);
}
