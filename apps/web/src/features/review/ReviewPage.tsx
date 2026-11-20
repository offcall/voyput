import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
	type CheckedStamp,
	checkStamp,
	type Passport,
	type PhotoIndex,
	type Stamp,
} from "@voyput/core";
import { Button, Tabs } from "@voyput/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { errorMessage, formatDay } from "./format";
import { overlapNotes } from "./overlaps";
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
	type StampUndo,
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

/** Each page's stamps with what the photo locations say and any overlapping stay, sorted by date. */
function useCheckedStamps(
	records: ReviewRecords | undefined,
	index: PhotoIndex | undefined,
	windowDays: number,
) {
	return useMemo(() => {
		const map = new Map<string, CheckedStamp[]>();
		if (!records || !index) return map;
		const overlaps = overlapNotes(records.stamps);
		for (const stamp of records.stamps) {
			const list = map.get(stamp.photoId) ?? [];
			const overlap = overlaps.get(stamp.id);
			list.push({
				stamp,
				check: checkStamp(index, stamp, windowDays),
				...(overlap ? { overlap } : {}),
			});
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
	/** The last deleted stamp as shown, and what Undo needs. */
	const [deleted, setDeleted] = useState<{
		stamp: Stamp;
		undo: StampUndo;
	} | null>(null);
	/**
	 * Open tab, photo and timeline band start live in the URL
	 * (`?tab=timeline&photo=<id>&from=<day>`); an unknown photo falls back to the first.
	 */
	const search = useSearch({ from: "/collect/$step" });
	const navigate = useNavigate({ from: "/collect/$step" });
	const currentId = search.photo ?? null;
	const setCurrentId = (photo: string) =>
		void navigate({ search: (s) => ({ ...s, photo }) });
	const tab = search.tab ?? "photos";
	const [focus, setFocus] = useState<Focus | null>(null);
	/** The timeline's page scroll when a stamp was opened from it, to come back to. */
	const timelineScroll = useRef<number | null>(null);
	/** A stamp was opened from the timeline: Photos offers the way back. */
	const [fromTimeline, setFromTimeline] = useState(false);
	const [rescans, setRescans] = useState<Record<string, RescanEntry>>({});
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [validations, setValidations] = useState<Record<string, Validation>>(
		{},
	);
	/** The one passport whose pages Review shows; null for all of them. */
	const [passportId, setPassportId] = useState<string | null>(null);

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
		// A stamp of another passport (from the timeline or a link) shows all passports again.
		const page = records.data?.photos.find((p) => p.id === stamp.photoId);
		if (page && passportId && page.passportId !== passportId)
			setPassportId(null);
		// The card scrolls itself into view; the router must not jump back to the top.
		void navigate({
			search: { tab: "photos", photo: stamp.photoId },
			replace,
			resetScroll: false,
		});
		setExpanded((e) => ({ ...e, [stamp.id]: true }));
		setFocus((f) => ({ stampId: stamp.id, seq: (f?.seq ?? 0) + 1 }));
	};
	/** Opens a stamp from the timeline; the band position stays in the URL for Back. */
	const openFromTimeline = (stamp: Stamp) => {
		timelineScroll.current = window.scrollY;
		setFromTimeline(true);
		void navigate({
			search: {
				tab: "photos",
				photo: stamp.photoId,
				...(search.from ? { from: search.from } : {}),
			},
			resetScroll: false,
		});
		setExpanded((e) => ({ ...e, [stamp.id]: true }));
		setFocus((f) => ({ stampId: stamp.id, seq: (f?.seq ?? 0) + 1 }));
	};
	const backToTimeline = () =>
		void navigate({
			search: (s) => ({ ...s, tab: "timeline" }),
			resetScroll: false,
		});
	// Back on the timeline (the button, browser Back or the tab): its scroll returns,
	// after the router has reset the scroll for the navigation.
	useEffect(() => {
		const y = timelineScroll.current;
		if (tab !== "timeline" || y === null) return;
		timelineScroll.current = null;
		setFromTimeline(false);
		const frame = requestAnimationFrame(() => window.scrollTo(0, y));
		return () => cancelAnimationFrame(frame);
	}, [tab]);
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
	const passports = records.data?.passports ?? [];
	/** A passport deleted meanwhile counts as all. */
	const passport = passports.some((p) => p.id === passportId)
		? passportId
		: null;
	const shown = useMemo(
		() =>
			records.data && passport
				? {
						...records.data,
						photos: records.data.photos.filter(
							(photo) => photo.passportId === passport,
						),
					}
				: records.data,
		[records.data, passport],
	);
	const photos = shown?.photos ?? [];
	const photoIds = photos.map((photo) => photo.id);
	const currentPhoto =
		photos.find((photo) => photo.id === currentId) ?? photos[0];
	const view = ui?.filter ?? DEFAULT_UI_STATE.filter;
	const queue = buildQueue(photoIds, stampsOf);
	/** The stamp opened from the queue or the timeline, if it is on the page shown. */
	const focusOnPage =
		focus &&
		currentPhoto &&
		byPhoto.get(currentPhoto.id)?.some((i) => i.stamp.id === focus.stampId)
			? focus.stampId
			: null;
	/**
	 * Opens the next stamp needing attention after `stampId` (or from the page start);
	 * the stamp `fold` (by default the one left) folds away.
	 */
	const goNext = (stampId: string | null, fold = stampId) => {
		if (!currentPhoto) return;
		const next = nextInQueue(photoIds, stampsOf, {
			photoId: currentPhoto.id,
			stampId,
		});
		if (!next) return;
		// Queue mode: the stamp left behind folds away.
		if (fold) setExpanded((e) => ({ ...e, [fold]: false }));
		openStamp(next.stamp);
	};

	return (
		<div className="review-page">
			{shown && history.data && ui && currentPhoto ? (
				<QueueBar
					queue={queue}
					current={focusOnPage}
					photoName={currentPhoto.name}
					view={view}
					viewCount={(key) =>
						photoIds.filter((id) => pageInView(stampsOf(id), key)).length
					}
					onView={(filter) => updateUi({ filter })}
					passports={passports}
					passport={passport}
					onPassport={setPassportId}
					onNext={() => goNext(focusOnPage, focus?.stampId ?? null)}
				/>
			) : null}
			{error ? (
				<p role="alert" className="review-error">
					Could not read the stored data: {error}
				</p>
			) : null}
			{!shown || !history.data || !ui ? (
				error ? null : (
					<div className="review-loading" aria-busy="true">
						<span className="review-skeleton" />
						<span className="review-skeleton" />
						<span className="review-sr">Loading…</span>
					</div>
				)
			) : (
				<Tabs
					value={tab}
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
								<>
									{fromTimeline ? (
										<Button className="review-back" onClick={backToTimeline}>
											← Back to timeline
										</Button>
									) : null}
									<PhotoReview
										records={shown}
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
										onDeleted={(stamp, undo) => setDeleted({ stamp, undo })}
										expanded={expanded}
										setExpanded={setExpanded}
										validations={validations}
										setValidations={setValidations}
										onNext={queue.length > 0 ? goNext : undefined}
										onOpenStamp={(stamp) => openStamp(stamp)}
									/>
								</>
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
									stamps={shown.stamps}
									photoNames={photoNames}
									windowDays={ui.timelineWindowDays}
									onWindowDays={(timelineWindowDays) =>
										updateUi({ timelineWindowDays })
									}
									from={search.from}
									onFrom={(from) =>
										void navigate({
											search: (s) => ({ ...s, from }),
											replace: true,
											resetScroll: false,
										})
									}
									stripDays={settings.locationWindowDays}
									onOpen={openFromTimeline}
								/>
							),
						},
					]}
				/>
			)}
			{deleted ? (
				<div className="review-toast" role="status">
					<span>
						Stamp deleted ({deleted.stamp.country ?? "unknown country"},{" "}
						{deleted.stamp.date ? formatDay(deleted.stamp.date) : "no date"}).
					</span>
					<Button
						onClick={() =>
							void restoreStamp(db, deleted.undo).then(() => setDeleted(null))
						}
					>
						Undo
					</Button>
				</div>
			) : null}
		</div>
	);
}

/** A passport as the passport select names it: its name, else its place in the list. */
const passportLabel = (passport: Passport, index: number): string =>
	passport.name.trim() || `#${index + 1}`;

/**
 * The queue on top of Review: where the user is among the stamps needing attention,
 * which pages the strip shows (by view and, with 2+ passports, by passport), and
 * Next to the next stamp needing attention across pages. With none left: "All
 * checked" and the way on to Stays.
 */
function QueueBar({
	queue,
	current,
	photoName,
	view,
	viewCount,
	onView,
	passports,
	passport,
	onPassport,
	onNext,
}: {
	queue: readonly CheckedStamp[];
	/** The open stamp on the page shown, if any. */
	current: string | null;
	photoName: string;
	view: ReviewView;
	viewCount: (view: ReviewView) => number;
	onView: (view: ReviewView) => void;
	passports: readonly Passport[];
	/** The passport shown; null for all. */
	passport: string | null;
	onPassport: (passportId: string | null) => void;
	onNext: () => void;
}) {
	const position = queue.findIndex((item) => item.stamp.id === current);
	return (
		<section className="review-queue" aria-label="Review queue">
			<p className="review-queue-text" aria-live="polite">
				{queue.length === 0 ? (
					<strong>All checked ✓</strong>
				) : position >= 0 ? (
					<>
						<strong className="review-queue-long">
							To check {position + 1} / {queue.length}
						</strong>
						<strong className="review-queue-short" aria-hidden="true">
							{position + 1} / {queue.length}
						</strong>
					</>
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
			{passports.length >= 2 ? (
				<label className="review-queue-view" data-kind="passport">
					<span className="review-sr">Passport</span>
					<select
						className="vp-input"
						value={passport ?? ""}
						onChange={(event) => onPassport(event.target.value || null)}
					>
						<option value="">Passport: All</option>
						{passports.map((p, i) => (
							<option key={p.id} value={p.id}>
								Passport: {passportLabel(p, i)}
							</option>
						))}
					</select>
				</label>
			) : null}
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
