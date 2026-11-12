import { Stack, Tabs } from "@voyput/ui";
import { useEffect, useState } from "react";
import { useDb } from "../../db/DbContext";
import { PhotoReview } from "./PhotoReview";
import {
	DEFAULT_UI_STATE,
	loadUiState,
	type ReviewUiState,
	saveUiState,
} from "./reviewStore";
import { TimelineView } from "./TimelineView";
import { useLocationHistory, useReviewRecords } from "./useReviewData";
import "./review.css";

export function ReviewPage() {
	const db = useDb();
	const records = useReviewRecords();
	const history = useLocationHistory();
	const [ui, setUi] = useState<ReviewUiState | null>(null);

	useEffect(() => {
		void loadUiState(db).then(setUi);
	}, [db]);
	const updateUi = (patch: Partial<ReviewUiState>) => {
		const next = { ...(ui ?? DEFAULT_UI_STATE), ...patch };
		setUi(next);
		void saveUiState(db, next);
	};

	return (
		<Stack>
			<h1>Review</h1>
			{!records || !history || !ui ? (
				<p>Loading…</p>
			) : (
				<>
					<p>
						{records.stamps.filter((s) => s.reviewed).length} of{" "}
						{records.stamps.length} stamps reviewed.
					</p>
					<Tabs
						items={[
							{
								value: "photos",
								label: "Photos",
								content: (
									<PhotoReview
										records={records}
										index={history.index}
										filter={ui.filter}
										onFilter={(filter) => updateUi({ filter })}
									/>
								),
							},
							{
								value: "timeline",
								label: "Timeline",
								content: (
									<TimelineView
										dayRuns={history.dayRuns}
										stamps={records.stamps}
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
		</Stack>
	);
}
