import { Card, Notice, Stack } from "@voyput/ui";
import { useCallback } from "react";
import { useLiveQuery } from "../../../data/useLiveQuery";
import { useDb } from "../../../db/DbContext";
import { PassportCard } from "./PassportCard";
import { PassportForm } from "./PassportForm";
import { PhotoGuidance } from "./PhotoGuidance";
import { createPassport, listPassports } from "./passportStore";

/** Passports and their page photos. */
export function PhotoImport() {
	const db = useDb();
	const { data: passports, error } = useLiveQuery(
		useCallback(() => listPassports(db), [db]),
	);

	return (
		<>
			<Card>
				<Stack>
					{error ? (
						<Notice tone="bad" role="alert">
							Could not read the passports: {error}
						</Notice>
					) : null}
					<PassportForm
						submitLabel="Add passport"
						onSubmit={async (input) => {
							await createPassport(db, input);
						}}
					/>
					<PhotoGuidance />
				</Stack>
			</Card>
			{passports?.map((passport) => (
				<PassportCard key={passport.id} passport={passport} />
			))}
		</>
	);
}
