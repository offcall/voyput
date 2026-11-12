import { type Passport, SUPPORTED_PHOTO_TYPES } from "@voyput/core";
import { Button, Card, Dialog, Dropzone } from "@voyput/ui";
import { useCallback, useState } from "react";
import { useDb } from "../../../db/DbContext";
import { PassportForm } from "./PassportForm";
import { PhotoThumb } from "./PhotoThumb";
import {
	addPhotos,
	deletePassport,
	deletePhoto,
	listPhotos,
	rotatePhoto,
	updatePassport,
} from "./passportStore";
import { useLiveQuery } from "./useLiveQuery";

/** One passport: its details, a drop target for page photos and their grid. */
export function PassportCard({ passport }: { passport: Passport }) {
	const db = useDb();
	const photos = useLiveQuery(
		useCallback(() => listPhotos(db, passport.id), [db, passport.id]),
	);
	const [rejected, setRejected] = useState<string[]>([]);
	const [editing, setEditing] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);

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
					onFiles={async (files) =>
						setRejected(await addPhotos(db, passport.id, files))
					}
				/>
				{rejected.length > 0 ? (
					<p role="alert" style={{ color: "var(--vp-bad)", margin: 0 }}>
						Not added, only JPEG and PNG are supported: {rejected.join(", ")}
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
									onRotate={() => rotatePhoto(db, photo.id, photo.rotation)}
									onDelete={() => deletePhoto(db, photo.id)}
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
							onClick={() => deletePassport(db, passport.id)}
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
		</Card>
	);
}
