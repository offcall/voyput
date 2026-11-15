import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
	type CheckedStamp,
	checkStamp,
	type PhotoIndex,
	type Stamp,
} from "@voyput/core";
import { Button, Tabs } from "@voyput/ui";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { errorMessage, formatDay } from "./format";
import { PhotoReview } from "./PhotoReview";
import {
	buildQueue,
	nextInQueue,
	pageInView,
	REVIEW_VIEWS,
	type ReviewView,
} from "./queue";
import type { RescanEntry } from "./RescanPanel";
import {
	DEFAULT_UI_STATE,
	loadUiState,
	type ReviewUiState,
	restoreStamp,
	saveUiState,
} from "./reviewStore";
import type { Validation } from "./StampCard";
import { TimelineView } from "./TimelineView";
import {
	type ReviewRecords,
	useLocationHistory,
	useReviewRecords,
} from "./useReviewData";
import "./review.css";

const UNDO_MS = 6000;

const VIEW_LABELS: Record<ReviewView, string> = {
	attention: "Needs attention",
	problem: "Problems",
	icloud: "Photo location mismatch",
	all: "All pages",
	unreviewed: "Unreviewed",
	reviewed: "Reviewed",
	empty: "No stamps",
};

const byDate = (a: CheckedStamp, b: CheckedStamp) =>
	(a.stamp.date ?? "9999").localeCompare(b.stamp.date ?? "9999") ||
	a.stamp.id.localeCompare(b.stamp.id);

/** Each page's stamps with what the photo locations say, sorted by date. */
function useCheckedStamps(
	records: ReviewRecords | undefined,
	index: PhotoIndex | undefined,
	windowDays: number,
) {
	return useMemo(() => {
		const map = new Map<string, CheckedStamp[]>();
		if (!records || !index) return map;
		for (const stamp of records.stamps) {
			const list = map.get(stamp.photoId) ?? [];
			list.push({ stamp, check: checkStamp(index, stamp, windowDays) });
			map.set(stamp.photoId, list);
		}
		for (const list of map.values()) list.sort(byDate);
		return map;
	}, [records, index, windowDays]);
}

/** A stamp opened from the timeline; `seq` re-focuses the same stamp twice. */
interface Focus {
	stampId: string;
	seq: number;
}

export function ReviewPage() {
	const db = useDb();
	const records = useReviewRecords();
	const history = useLocationHistory();
	const { settings } = useSettings();
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
	const [rescans, setRescans] = useState<Record<string, RescanEntry>>({});
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
	const byPhoto = useCheckedStamps(
		records.data,
		history.data?.index,
		settings.locationWindowDays,
	);
	const stampsOf = (photoId: string) => byPhoto.get(photoId) ?? [];
	const photos = records.data?.photos ?? [];
	const photoIds = photos.map((photo) => photo.id);
	const currentPhoto =
		photos.find((photo) => photo.id === currentId) ?? photos[0];
	const view = ui?.filter ?? DEFAULT_UI_STATE.filter;

	return (
		<div className="review-page">
			{records.data && history.data && ui && currentPhoto ? (
				<QueueBar
					queue={buildQueue(photoIds, stampsOf)}
					current={
						focus &&
						byPhoto
							.get(currentPhoto.id)
							?.some((i) => i.stamp.id === focus.stampId)
							? focus.stampId
							: null
					}
					photoName={currentPhoto.name}
					view={view}
					viewCount={(key) =>
						photoIds.filter((id) => pageInView(stampsOf(id), key)).length
					}
					onView={(filter) => updateUi({ filter })}
					onNext={() => {
						const next = nextInQueue(photoIds, stampsOf, {
							photoId: currentPhoto.id,
							stampId:
								focus &&
								byPhoto
									.get(currentPhoto.id)
									?.some((i) => i.stamp.id === focus.stampId)
									? focus.stampId
									: null,
						});
						if (!next) return;
						// Queue mode: the stamp left behind folds away.
						if (focus) setExpanded((e) => ({ ...e, [focus.stampId]: false }));
						openStamp(next.stamp);
					}}
				/>
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
									travelDays={history.data.travelDays}
									stampsOf={stampsOf}
									view={ui.filter}
									currentId={currentId}
									focusStampId={focus?.stampId ?? null}
									focusSeq={focus?.seq ?? 0}
									rescans={rescans}
									setRescans={setRescans}
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
									travelDays={history.data.travelDays}
									index={history.data.index}
									stamps={records.data.stamps}
									photoNames={photoNames}
									windowDays={ui.timelineWindowDays}
									onWindowDays={(timelineWindowDays) =>
										updateUi({ timelineWindowDays })
									}
									stripDays={settings.locationWindowDays}
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
						{deleted.date ? formatDay(deleted.date) : "no date"}).
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

/**
 * The queue on top of Review: where the user is among the stamps needing attention,
 * which pages the strip shows, and Next to the next stamp needing attention across
 * pages. With none left: "All checked" and the way on to Stays.
 */
function QueueBar({
	queue,
	current,
	photoName,
	view,
	viewCount,
	onView,
	onNext,
}: {
	queue: readonly CheckedStamp[];
	/** The open stamp on the page shown, if any. */
	current: string | null;
	photoName: string;
	view: ReviewView;
	viewCount: (view: ReviewView) => number;
	onView: (view: ReviewView) => void;
	onNext: () => void;
}) {
	const position = queue.findIndex((item) => item.stamp.id === current);
	return (
		<section className="review-queue" aria-label="Review queue">
			<p className="review-queue-text" aria-live="polite">
				{queue.length === 0 ? (
					<strong>All checked ✓</strong>
				) : position >= 0 ? (
					<strong>
						To check {position + 1} / {queue.length}
					</strong>
				) : (
					<strong>{queue.length} to check</strong>
				)}{" "}
				<span className="review-muted">· {photoName}</span>
			</p>
			<label className="review-queue-view">
				<span className="review-sr">Pages</span>
				<select
					className="vp-input"
					value={view}
					onChange={(event) => {
						const next = REVIEW_VIEWS.find((v) => v === event.target.value);
						if (next) onView(next);
					}}
				>
					{REVIEW_VIEWS.map((key) => (
						<option key={key} value={key}>
							{VIEW_LABELS[key]} ({viewCount(key)})
						</option>
					))}
				</select>
			</label>
			{queue.length === 0 ? (
				<Link
					to="/collect/$step"
					params={{ step: "trips" }}
					className="vp-button"
					data-variant="primary"
				>
					Go to Stays →
				</Link>
			) : (
				<Button variant="primary" onClick={onNext}>
					Next →
				</Button>
			)}
		</section>
	);
}
