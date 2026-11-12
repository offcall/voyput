import { type Passport, SUPPORTED_PHOTO_TYPES } from "@voyput/core";
import { Button, Card, Dialog, Dropzone } from "@voyput/ui";
import { useCallback, useState } from "react";
import { useDb } from "../../../db/DbContext";
import type { PhotoRecord } from "../../../db/db";
import { PassportForm } from "./PassportForm";
import { PhotoThumb } from "./PhotoThumb";
import {
	type AddPhotosResult,
	addPhotos,
	deletePassport,
	deletePhoto,
	listPhotos,
	rotatePhoto,
	storageErrorMessage,
	updatePassport,
} from "./passportStore";
import { useLiveQuery } from "./useLiveQuery";

/** One passport: its details, a drop target for page photos and their grid. */
export function PassportCard({ passport }: { passport: Passport }) {
	const db = useDb();
	const { data: photos, error: readError } = useLiveQuery(
		useCallback(() => listPhotos(db, passport.id), [db, passport.id]),
	);
	const [added, setAdded] = useState<AddPhotosResult>({
		rejected: [],
		duplicates: [],
	});
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

	return (
		<Card title={passport.name}>
			<div style={{ display: "grid", gap: 12 }}>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<span style={{ color: "var(--vp-muted)", flex: 1 }}>
						{validity} · {photos?.length ?? 0} photo(s)
					</span>
					<Button onClick={() => setEditing(true)}>Edit</Button>
					<Button variant="danger" onClick={() => setConfirmingDelete(true)}>
						Delete
					</Button>
				</div>

				<Dropzone
					accept={SUPPORTED_PHOTO_TYPES.join(",")}
					multiple
					label={`Add page photos to ${passport.name}`}
					hint="JPEG or PNG. Drop files here or pick them."
					onFiles={(files) =>
						run("add the photos", async () =>
							setAdded(await addPhotos(db, passport.id, files)),
						)
					}
				/>
				{added.rejected.length > 0 ? (
					<p role="alert" style={{ color: "var(--vp-bad)", margin: 0 }}>
						Not added, only JPEG and PNG are supported:{" "}
						{added.rejected.join(", ")}
					</p>
				) : null}
				{added.duplicates.length > 0 ? (
					<p role="status" style={{ margin: 0 }}>
						Already added: {added.duplicates.join(", ")}
					</p>
				) : null}
				{readError ? (
					<p role="alert" style={{ color: "var(--vp-bad)", margin: 0 }}>
						Could not read the photos: {readError}
					</p>
				) : null}

				{error ? (
					<p role="alert" style={{ color: "var(--vp-bad)", margin: 0 }}>
						{error}
					</p>
				) : null}

				{photos && photos.length > 0 ? (
					<ul
						aria-label={`Photos of ${passport.name}`}
						style={{
							listStyle: "none",
							padding: 0,
							margin: 0,
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
							gap: 12,
						}}
					>
						{photos.map((photo) => (
							<li key={photo.id}>
								<PhotoThumb
									photo={photo}
									onRotate={() =>
										run("rotate the photo", () => rotatePhoto(db, photo.id))
									}
									onDelete={() => setPhotoToDelete(photo)}
								/>
							</li>
						))}
					</ul>
				) : null}
			</div>

			<Dialog
				open={editing}
				onOpenChange={setEditing}
				title={`Edit ${passport.name}`}
			>
				<PassportForm
					initial={passport}
					submitLabel="Save"
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
					Its {photos?.length ?? 0} photo(s), their extractions and stamps are
					removed from this browser.
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
