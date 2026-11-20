import { Link } from "@tanstack/react-router";
import {
	type CheckedStamp,
	countryNamesToCodes,
	type DateRange,
	type DayRun,
	nearbyPhotos,
	type PhotoIndex,
	type Stamp,
} from "@voyput/core";
import { Button, EmptyState, Notice, PixelArt } from "@voyput/ui";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useAi } from "../../ai/AiContext";
import { aiSetupNeeded } from "../../ai/client";
import type { StaysUndo } from "../../data/evidenceChange";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { describeFailure } from "../extract/failure";
import { photoBoxes } from "./boxes";
import { errorMessage } from "./format";
import { PhotoList } from "./PhotoList";
import { PhotoViewer } from "./PhotoViewer";
import type { ReviewView } from "./queue";
import { IDLE_RESCAN, type RescanEntry, RescanPanel } from "./RescanPanel";
import { rescanPhoto, validateStamp } from "./reviewAi";
import {
	addFoundStamp,
	addManualStamp,
	deleteStamp,
	setDismissed,
	updateStamp,
} from "./reviewStore";
import { COUNTRY_LIST_ID, StampCard, type Validation } from "./StampCard";
import type { TravelDays } from "./strip";
import { useStripHint } from "./stripHint";
import type { ReviewRecords } from "./useReviewData";

const NO_RANGE: DateRange = { from: null, to: null };

/** Photo strip, then the current photo beside its stamps as editable cards. */
export function PhotoReview({
	records,
	index,
	dayRuns,
	travelDays,
	stampsOf,
	view,
	currentId,
	focusStampId,
	focusSeq,
	onSelect,
	onDeleted,
	expanded,
	setExpanded,
	validations,
	setValidations,
	rescans,
	setRescans,
	onNext,
	onOpenStamp,
}: {
	records: ReviewRecords;
	index: PhotoIndex;
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
	/** A page's stamps with their checks, in the order shown. */
	stampsOf: (photoId: string) => readonly CheckedStamp[];
	/** Pages shown in the strip. */
	view: ReviewView;
	currentId: string | null;
	/** A stamp opened from the queue or the timeline: shown open and scrolled to. */
	focusStampId: string | null;
	/** Grows each time a stamp is opened, so the same stamp scrolls into view again. */
	focusSeq: number;
	onSelect: (photoId: string) => void;
	/** With the stays the delete changed, for Undo. */
	onDeleted: (stamp: Stamp, stays: StaysUndo) => void;
	/** Open or closed per stamp id; kept by the page so a tab switch keeps it. */
	expanded: Record<string, boolean>;
	setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
	/** AI validate results per stamp id; kept by the page for the same reason. */
	validations: Record<string, Validation>;
	setValidations: Dispatch<SetStateAction<Record<string, Validation>>>;
	/** Rescan hint and finds per photo id; kept by the page for the same reason. */
	rescans: Record<string, RescanEntry>;
	setRescans: Dispatch<SetStateAction<Record<string, RescanEntry>>>;
	/** Next in the queue from a stamp; missing when nothing is left to check. */
	onNext: ((stampId: string) => void) | undefined;
	/** Opens a stamp's card and scrolls to it, as from the timeline. */
	onOpenStamp: (stamp: Stamp) => void;
}) {
	const db = useDb();
	const ai = useAi();
	const { settings } = useSettings();
	/** The card under the pointer, and the card last opened: their boxes stand out. */
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [openedId, setOpenedId] = useState<string | null>(null);
	const stripHint = useStripHint();
	// biome-ignore lint/correctness/useExhaustiveDependencies: each focus, even of the same stamp
	useEffect(() => {
		if (focusStampId) setOpenedId(focusStampId);
	}, [focusStampId, focusSeq]);

	const countryCodes = useMemo(() => {
		const map = countryNamesToCodes();
		for (const [code, name] of index.countryNames) map.set(name, code);
		for (const s of records.stamps)
			if (s.country && s.countryCode) map.set(s.country, s.countryCode);
		return map;
	}, [index, records.stamps]);
	const countryNames = useMemo(
		() => new Map([...countryCodes].map(([name, code]) => [code, name])),
		[countryCodes],
	);

	const photo =
		records.photos.find((p) => p.id === currentId) ?? records.photos[0];
	if (!photo)
		return (
			<EmptyState
				art={<PixelArt name="passport" scale={5} />}
				title="No passport photos yet"
				action={
					<Link
						to="/collect/$step"
						params={{ step: "passports" }}
						className="vp-button"
						data-variant="primary"
					>
						Import photos
					</Link>
				}
			>
				Import photos of your stamp pages, or load the demo data.
			</EmptyState>
		);

	const passport = records.passports.find((p) => p.id === photo.passportId);
	const range: DateRange = passport
		? { from: passport.validFrom, to: passport.validTo }
		: NO_RANGE;
	const items = stampsOf(photo.id);
	const open = items.filter((item) => !item.stamp.reviewed).length;
	const aiSetup = aiSetupNeeded(settings);
	const aiReady = aiSetup === null;
	const isExpanded = (stamp: Stamp) => expanded[stamp.id] ?? !stamp.reviewed;
	const extraction = records.extractions.get(photo.id);
	/** The drag hint goes on the first day strip shown, not on every card. */
	const hintStampId = items.find(
		(item) => item.stamp.date && isExpanded(item.stamp),
	)?.stamp.id;

	const validate = async (item: CheckedStamp) => {
		const id = item.stamp.id;
		setValidations((v) => ({ ...v, [id]: { status: "running" } }));
		let next: Validation;
		try {
			const result = await validateStamp(
				ai,
				settings,
				photo,
				item.stamp,
				item.check,
				nearbyPhotos(index, item.stamp.date),
			);
			next = { status: "done", result };
		} catch (error) {
			next = { status: "error", message: errorMessage(error) };
		}
		setValidations((v) => ({ ...v, [id]: next }));
	};

	return (
		<div className="review-photos">
			<PhotoList
				photos={records.photos}
				stampsOf={stampsOf}
				view={view}
				currentId={photo.id}
				onSelect={onSelect}
			/>
			<div className="review-split">
				<section className="review-photo-pane" aria-label="Photo">
					<h2 className="review-pane-title">
						{passport ? (
							<span className="review-muted">{passport.name} / </span>
						) : null}
						{photo.name}
					</h2>
					<PhotoViewer
						photo={photo}
						boxes={photoBoxes(items)}
						activeStampId={hoveredId ?? openedId}
						onPickStamp={(id) => {
							const picked = items.find((item) => item.stamp.id === id);
							if (picked) onOpenStamp(picked.stamp);
						}}
					/>
					<RescanPanel
						entry={rescans[photo.id] ?? IDLE_RESCAN}
						update={(change) =>
							setRescans((all) => ({
								...all,
								[photo.id]: change(all[photo.id] ?? IDLE_RESCAN),
							}))
						}
						onRescan={
							aiReady
								? (hint) =>
										rescanPhoto(
											ai,
											settings,
											photo,
											range,
											items.map((item) => item.stamp),
											hint,
										)
								: undefined
						}
						onAccept={(found) => addFoundStamp(db, photo, found)}
					>
						{aiReady ? null : (
							<p className="review-muted">
								{settings.aiProvider === "local"
									? "Validate and rescan need voyput-local paired."
									: "Validate and rescan need your OpenRouter key."}{" "}
								<Link to="/settings">{aiSetup?.action}</Link>.
							</p>
						)}
					</RescanPanel>
				</section>
				<section className="review-stamps" aria-label="Stamps">
					<div className="review-pane-head">
						<h2 className="review-pane-title">
							Stamps{" "}
							<span className="review-muted">
								{items.length === 0
									? "none yet"
									: open === 0
										? `${items.length} · all reviewed`
										: `${items.length} · ${open} to review`}
							</span>
						</h2>
						<Button onClick={() => void addManualStamp(db, photo)}>
							+ Add stamp
						</Button>
					</div>
					{extraction?.status === "failed" ? (
						<Notice tone="bad" role="status">
							AI extraction failed on this photo:{" "}
							{describeFailure(extraction.notes).detail}. Add its stamps by
							hand, or retry it on Extract.
						</Notice>
					) : null}
					{items.length === 0 ? (
						<div className="review-empty" data-size="small">
							<PixelArt name="stamp" scale={3} />
							<strong>No stamps on this photo</strong>
							<span>
								Add one by hand, or rescan the photo with AI to look for missed
								stamps.
							</span>
						</div>
					) : null}
					{items.map((item, i) => (
						<StampCard
							key={item.stamp.id}
							item={item}
							number={i + 1}
							dayRuns={dayRuns}
							travelDays={travelDays}
							windowDays={settings.locationWindowDays}
							nearby={
								isExpanded(item.stamp)
									? nearbyPhotos(index, item.stamp.date)
									: []
							}
							expanded={isExpanded(item.stamp)}
							focusSeq={item.stamp.id === focusStampId ? focusSeq : null}
							countryCodes={countryCodes}
							countryNames={countryNames}
							validation={validations[item.stamp.id]}
							onToggle={() => {
								if (!isExpanded(item.stamp)) setOpenedId(item.stamp.id);
								setExpanded((e) => ({
									...e,
									[item.stamp.id]: !isExpanded(item.stamp),
								}));
							}}
							{...(item.stamp.id === hintStampId ? { stripHint } : {})}
							onHover={(on) =>
								setHoveredId((id) =>
									on ? item.stamp.id : id === item.stamp.id ? null : id,
								)
							}
							onEdit={(edit) => {
								// Marking a stamp reviewed folds it away; unmarking opens it.
								if (edit.reviewed !== undefined)
									setExpanded((e) => ({
										...e,
										[item.stamp.id]: !edit.reviewed,
									}));
								void updateStamp(db, item.stamp.id, edit);
							}}
							onDelete={() =>
								void deleteStamp(db, item.stamp).then((stays) =>
									onDeleted(item.stamp, stays),
								)
							}
							onDismiss={(kind, value) =>
								void setDismissed(db, item.stamp.id, kind, value)
							}
							onValidate={aiReady ? () => void validate(item) : undefined}
							onNext={onNext ? () => onNext(item.stamp.id) : undefined}
						/>
					))}
				</section>
			</div>
			<datalist id={COUNTRY_LIST_ID}>
				{[...countryCodes.keys()].sort().map((name) => (
					<option key={name} value={name} />
				))}
			</datalist>
		</div>
	);
}
