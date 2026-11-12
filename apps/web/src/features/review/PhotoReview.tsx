import { Link } from "@tanstack/react-router";
import {
	type CheckedStamp,
	checkStamp,
	type DateRange,
	nearbyPhotos,
	type PhotoIndex,
	type ReviewFilter,
	type Stamp,
} from "@voyput/core";
import { Button, Card } from "@voyput/ui";
import { useEffect, useMemo, useState } from "react";
import { useAi } from "../../ai/AiContext";
import { useDb } from "../../db/DbContext";
import { useSettings } from "../../settings/SettingsContext";
import { errorMessage } from "./format";
import { PhotoList } from "./PhotoList";
import { PhotoViewer } from "./PhotoViewer";
import { RescanPanel } from "./RescanPanel";
import { rescanPhoto, validateStamp } from "./reviewAi";
import {
	addFoundStamp,
	addManualStamp,
	deleteStamp,
	restoreStamp,
	setDismissed,
	updateStamp,
} from "./reviewStore";
import { COUNTRY_LIST_ID, StampCard, type Validation } from "./StampCard";
import type { ReviewRecords } from "./useReviewData";

const UNDO_MS = 6000;
const NO_RANGE: DateRange = { from: null, to: null };

const byDate = (a: CheckedStamp, b: CheckedStamp) =>
	(a.stamp.date ?? "9999").localeCompare(b.stamp.date ?? "9999") ||
	a.stamp.id.localeCompare(b.stamp.id);

/** Photo list, the current photo and its stamps as editable cards. */
export function PhotoReview({
	records,
	index,
	filter,
	onFilter,
}: {
	records: ReviewRecords;
	index: PhotoIndex;
	filter: ReviewFilter;
	onFilter: (filter: ReviewFilter) => void;
}) {
	const db = useDb();
	const ai = useAi();
	const { settings } = useSettings();
	const [currentId, setCurrentId] = useState<string | null>(null);
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [validations, setValidations] = useState<Record<string, Validation>>(
		{},
	);
	const [deleted, setDeleted] = useState<Stamp | null>(null);

	useEffect(() => {
		if (!deleted) return;
		const timer = setTimeout(() => setDeleted(null), UNDO_MS);
		return () => clearTimeout(timer);
	}, [deleted]);

	const byPhoto = useMemo(() => {
		const map = new Map<string, CheckedStamp[]>();
		for (const stamp of records.stamps) {
			const list = map.get(stamp.photoId) ?? [];
			list.push({ stamp, check: checkStamp(index, stamp) });
			map.set(stamp.photoId, list);
		}
		for (const list of map.values()) list.sort(byDate);
		return map;
	}, [records.stamps, index]);
	const stampsOf = (photoId: string) => byPhoto.get(photoId) ?? [];

	const countryCodes = useMemo(() => {
		const map = new Map<string, string>();
		for (const [code, name] of index.countryNames) map.set(name, code);
		for (const s of records.stamps)
			if (s.country && s.countryCode) map.set(s.country, s.countryCode);
		return map;
	}, [index, records.stamps]);

	const photo =
		records.photos.find((p) => p.id === currentId) ?? records.photos[0];
	if (!photo)
		return (
			<p>
				No passport photos yet. <Link to="/import">Import photos</Link> or load
				the demo first.
			</p>
		);

	const passport = records.passports.find((p) => p.id === photo.passportId);
	const range: DateRange = passport
		? { from: passport.validFrom, to: passport.validTo }
		: NO_RANGE;
	const items = stampsOf(photo.id);
	const aiReady = Boolean(settings.openRouterKey);
	const isExpanded = (stamp: Stamp) => expanded[stamp.id] ?? !stamp.reviewed;

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
		<div className="review-layout">
			<PhotoList
				photos={records.photos}
				stampsOf={stampsOf}
				filter={filter}
				currentId={photo.id}
				onFilter={onFilter}
				onSelect={setCurrentId}
			/>
			<section className="review-photo" aria-label="Photo">
				<h2 className="review-photo-title">
					{passport ? `${passport.name} / ` : ""}
					{photo.name}
				</h2>
				<PhotoViewer photo={photo} />
				{aiReady ? null : (
					<p className="review-muted">
						Validate and rescan need your OpenRouter key.{" "}
						<Link to="/settings">Add it in Settings</Link>.
					</p>
				)}
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
				/>
			</section>
			<section className="review-stamps" aria-label="Stamps">
				<div className="review-toolbar">
					<Button onClick={() => void addManualStamp(db, photo)}>
						Add stamp
					</Button>
				</div>
				{items.length === 0 ? (
					<p className="review-muted">No stamps on this photo.</p>
				) : null}
				{items.map((item, i) => (
					<StampCard
						key={item.stamp.id}
						item={item}
						number={i + 1}
						nearby={
							isExpanded(item.stamp) ? nearbyPhotos(index, item.stamp.date) : []
						}
						expanded={isExpanded(item.stamp)}
						countryCodes={countryCodes}
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
								setExpanded((e) => ({ ...e, [item.stamp.id]: !edit.reviewed }));
							void updateStamp(db, item.stamp, edit, range);
						}}
						onDelete={() =>
							void deleteStamp(db, item.stamp).then(() =>
								setDeleted(item.stamp),
							)
						}
						onDismiss={(kind, value) =>
							void setDismissed(db, item.stamp, kind, value)
						}
						onValidate={aiReady ? () => void validate(item) : undefined}
					/>
				))}
			</section>
			<datalist id={COUNTRY_LIST_ID}>
				{[...countryCodes.keys()].sort().map((name) => (
					<option key={name} value={name} />
				))}
			</datalist>
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
		</div>
	);
}
