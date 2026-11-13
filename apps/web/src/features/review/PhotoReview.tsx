import { Link } from "@tanstack/react-router";
import {
	type CheckedStamp,
	checkStamp,
	countryNamesToCodes,
	type DateRange,
	type DayRun,
	nearbyPhotos,
	type PhotoIndex,
	type ReviewFilter,
	type Stamp,
} from "@voyput/core";
import { Button, EmptyState, Notice, PixelArt } from "@voyput/ui";
import { type Dispatch, type SetStateAction, useMemo } from "react";
import { useAi } from "../../ai/AiContext";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { describeFailure } from "../extract/failure";
import { errorMessage } from "./format";
import { PhotoList } from "./PhotoList";
import { PhotoViewer } from "./PhotoViewer";
import { RescanPanel } from "./RescanPanel";
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
import type { ReviewRecords } from "./useReviewData";

const NO_RANGE: DateRange = { from: null, to: null };

const byDate = (a: CheckedStamp, b: CheckedStamp) =>
	(a.stamp.date ?? "9999").localeCompare(b.stamp.date ?? "9999") ||
	a.stamp.id.localeCompare(b.stamp.id);

/** Photo strip, then the current photo beside its stamps as editable cards. */
export function PhotoReview({
	records,
	index,
	dayRuns,
	travelDays,
	filter,
	currentId,
	focusStampId,
	onFilter,
	onSelect,
	onDeleted,
	expanded,
	setExpanded,
	validations,
	setValidations,
}: {
	records: ReviewRecords;
	index: PhotoIndex;
	dayRuns: readonly DayRun[];
	travelDays: TravelDays;
	filter: ReviewFilter;
	currentId: string | null;
	/** A stamp opened from the timeline: shown open and scrolled to. */
	focusStampId: string | null;
	onFilter: (filter: ReviewFilter) => void;
	onSelect: (photoId: string) => void;
	onDeleted: (stamp: Stamp) => void;
	/** Open or closed per stamp id; kept by the page so a tab switch keeps it. */
	expanded: Record<string, boolean>;
	setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
	/** AI validate results per stamp id; kept by the page for the same reason. */
	validations: Record<string, Validation>;
	setValidations: Dispatch<SetStateAction<Record<string, Validation>>>;
}) {
	const db = useDb();
	const ai = useAi();
	const { settings } = useSettings();

	const byPhoto = useMemo(() => {
		const map = new Map<string, CheckedStamp[]>();
		for (const stamp of records.stamps) {
			const list = map.get(stamp.photoId) ?? [];
			list.push({
				stamp,
				check: checkStamp(index, stamp, settings.locationWindowDays),
			});
			map.set(stamp.photoId, list);
		}
		for (const list of map.values()) list.sort(byDate);
		return map;
	}, [records.stamps, index, settings.locationWindowDays]);
	const stampsOf = (photoId: string) => byPhoto.get(photoId) ?? [];

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
	const aiReady = Boolean(settings.openRouterKey);
	const isExpanded = (stamp: Stamp) => expanded[stamp.id] ?? !stamp.reviewed;
	const extraction = records.extractions.get(photo.id);

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
				filter={filter}
				currentId={photo.id}
				onFilter={onFilter}
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
					<PhotoViewer photo={photo} />
					<RescanPanel
						key={photo.id}
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
								Validate and rescan need your OpenRouter key.{" "}
								<Link to="/settings">Add it in Settings</Link>.
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
							focused={item.stamp.id === focusStampId}
							countryCodes={countryCodes}
							countryNames={countryNames}
							validation={validations[item.stamp.id]}
							onToggle={() =>
								setExpanded((e) => ({
									...e,
									[item.stamp.id]: !isExpanded(item.stamp),
								}))
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
								void deleteStamp(db, item.stamp).then(() =>
									onDeleted(item.stamp),
								)
							}
							onDismiss={(kind, value) =>
								void setDismissed(db, item.stamp.id, kind, value)
							}
							onValidate={aiReady ? () => void validate(item) : undefined}
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
