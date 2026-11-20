import type { Passport } from "@voyput/core";
import { Button, Card, Dialog, Dropzone, Menu, Notice } from "@voyput/ui";
import { useCallback, useState } from "react";
import { useLiveQuery } from "../../../data/useLiveQuery";
import { useDb } from "../../../db/DbContext";
import type { PhotoRecord } from "../../../db/db";
import { isAppleMobile, photoAccept } from "./heic";
import { PassportForm } from "./PassportForm";
import { PhotoThumb } from "./PhotoThumb";
import {
	type AddPhotosResult,
	addPhotos,
	deletePassport,
	deletePhoto,
	listPhotoStatuses,
	listPhotos,
	rotatePhoto,
	storageErrorMessage,
	updatePassport,
} from "./passportStore";

/** One passport: its details, a drop target for page photos and their grid. */
export function PassportCard({ passport }: { passport: Passport }) {
	const db = useDb();
	const { data: photos, error: readError } = useLiveQuery(
		useCallback(() => listPhotos(db, passport.id), [db, passport.id]),
	);
	const { data: statuses } = useLiveQuery(
		useCallback(() => listPhotoStatuses(db, passport.id), [db, passport.id]),
	);
	const [added, setAdded] = useState<AddPhotosResult>({
		rejected: [],
		duplicates: [],
		failed: [],
	});
	const [converting, setConverting] = useState(0);
	const [editing, setEditing] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [photoToDelete, setPhotoToDelete] = useState<PhotoRecord | null>(null);
	const [error, setError] = useState<string | null>(null);

	/** Runs a storage write and shows its failure instead of losing it. */
	const run = async (action: string, write: () => Promise<unknown>) => {
		setError(null);
		try {
			await write();
		} catch (failure) {
			setError(storageErrorMessage(action, failure));
		}
	};

	const validity =
		passport.validFrom || passport.validTo
			? `valid ${passport.validFrom ?? "?"} – ${passport.validTo ?? "?"}`
			: "validity not set";

	const photoCount = photos?.length ?? 0;

	return (
		<Card
			title={passport.name}
			description={`${validity} · ${photoCount} ${photoCount === 1 ? "photo" : "photos"}`}
			actions={
				<Menu
					label={`More for ${passport.name}`}
					items={[
						{ label: "Edit", onSelect: () => setEditing(true) },
						{
							label: "Delete",
							tone: "danger",
							onSelect: () => setConfirmingDelete(true),
						},
					]}
				/>
			}
		>
			<div className="import-messages">
				{converting > 0 ? (
					<Notice role="status">
						Converting {converting} HEIC {converting === 1 ? "photo" : "photos"}
						…
					</Notice>
				) : null}
				{added.rejected.length > 0 ? (
					<Notice tone="bad" role="alert">
						Not added, only JPEG, PNG and HEIC are supported:{" "}
						{added.rejected.join(", ")}
					</Notice>
				) : null}
				{added.failed.map(({ name, reason }) => (
					<Notice key={name} tone="bad" role="alert">
						Could not convert {name} to JPEG: {reason}
					</Notice>
				))}
				{added.duplicates.length > 0 ? (
					<Notice tone="warn" role="status">
						Already added: {added.duplicates.join(", ")}
					</Notice>
				) : null}
				{readError ? (
					<Notice tone="bad" role="alert">
						Could not read the photos: {readError}
					</Notice>
				) : null}
				{error ? (
					<Notice tone="bad" role="alert">
						{error}
					</Notice>
				) : null}
			</div>

			<ul aria-label={`Photos of ${passport.name}`} className="import-grid">
				{photos?.map((photo) => (
					<li key={photo.id}>
						<PhotoThumb
							photo={photo}
							status={statuses?.get(photo.id)}
							onRotate={() =>
								run("rotate the photo", () => rotatePhoto(db, photo.id))
							}
							onDelete={() => setPhotoToDelete(photo)}
						/>
					</li>
				))}
				<li>
					<Dropzone
						accept={photoAccept(isAppleMobile(navigator))}
						multiple
						label={`Add page photos to ${passport.name}`}
						hint="JPEG, PNG or HEIC · drop or click"
						onFiles={(files) =>
							run("add the photos", async () =>
								setAdded(
									await addPhotos(db, passport.id, files, {
										onConverting: setConverting,
									}),
								),
							)
						}
					/>
				</li>
			</ul>

			<Dialog
				open={editing}
				onOpenChange={setEditing}
				title={`Edit ${passport.name}`}
			>
				<PassportForm
					initial={passport}
					submitLabel="Save"
					layout="stacked"
					onSubmit={async (input) => {
						await updatePassport(db, passport.id, input);
						setEditing(false);
					}}
				/>
			</Dialog>

			<Dialog
				open={confirmingDelete}
				onOpenChange={setConfirmingDelete}
				title={`Delete ${passport.name}?`}
				actions={
					<>
						<Button onClick={() => setConfirmingDelete(false)}>Cancel</Button>
						<Button
							variant="danger"
							onClick={async () => {
								setConfirmingDelete(false);
								await run("delete the passport", () =>
									deletePassport(db, passport.id),
								);
							}}
						>
							Delete passport
						</Button>
					</>
				}
			>
				<p>
					Its {photoCount} photo(s), their extractions and stamps are removed
					from this browser.
				</p>
			</Dialog>

			<Dialog
				open={photoToDelete !== null}
				onOpenChange={(open) => {
					if (!open) setPhotoToDelete(null);
				}}
				title={`Delete ${photoToDelete?.name ?? "photo"}?`}
				actions={
					<>
						<Button onClick={() => setPhotoToDelete(null)}>Cancel</Button>
						<Button
							variant="danger"
							onClick={async () => {
								const photo = photoToDelete;
								setPhotoToDelete(null);
								if (photo)
									await run("delete the photo", () =>
										deletePhoto(db, photo.id),
									);
							}}
						>
							Delete photo
						</Button>
					</>
				}
			>
				<p>
					The photo, its extraction and its stamps are removed from this
					browser.
				</p>
			</Dialog>
		</Card>
	);
}
