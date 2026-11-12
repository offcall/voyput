import { Card } from "@voyput/ui";
import { useCallback } from "react";
import { useDb } from "../../../db/DbContext";
import { PassportCard } from "./PassportCard";
import { PassportForm } from "./PassportForm";
import { PhotoGuidance } from "./PhotoGuidance";
import { createPassport, listPassports } from "./passportStore";
import { useLiveQuery } from "./useLiveQuery";

/** Passports and their page photos. */
export function PhotoImport() {
	const db = useDb();
	const { data: passports, error } = useLiveQuery(
		useCallback(() => listPassports(db), [db]),
	);

	return (
		<>
			<Card title="Passport photos">
				<div style={{ display: "grid", gap: 12 }}>
					<p style={{ margin: 0 }}>
						Add each passport, then photos of its stamp pages.
					</p>
					<PhotoGuidance />
					{error ? (
						<p role="alert">Could not read the passports: {error}</p>
					) : null}
					<PassportForm
						submitLabel="Add passport"
						onSubmit={async (input) => {
							await createPassport(db, input);
						}}
					/>
				</div>
			</Card>
			{passports?.map((passport) => (
				<PassportCard key={passport.id} passport={passport} />
			))}
		</>
	);
}
