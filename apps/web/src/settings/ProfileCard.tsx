import { isIsoDate } from "@voyput/core";
import { Card, PixelArt } from "@voyput/ui";
import { useEffect, useState } from "react";
import { useDb } from "../db/DbContext";
import { DateField } from "../features/trips/DateField";
import { CountrySelect } from "../features/trips/StayForms";
import {
	type Birth,
	changeBirth,
	loadBirth,
} from "../features/trips/tripStore";

/** Birth country and date: with both set, the history starts with a stay there since birth. */
export function ProfileCard() {
	const db = useDb();
	const [birth, setBirth] = useState<Birth | null>(null);
	const [typed, setTyped] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		loadBirth(db).then(
			(loaded) => {
				if (!alive) return;
				setBirth(loaded);
				setTyped(loaded.birth ?? "");
			},
			(e: unknown) => alive && setError(String(e)),
		);
		return () => {
			alive = false;
		};
	}, [db]);

	const save = (next: Birth) => {
		setBirth(next);
		changeBirth(db, next).catch((e: unknown) => setError(String(e)));
	};

	return (
		<Card
			title="Profile"
			art={<PixelArt name="passport" scale={3} />}
			description="With both set, your stays start with a stay in your birth country since birth."
		>
			{birth ? (
				<div className="settings-profile">
					<CountrySelect
						label="Birth country"
						value={birth.birthCountry ?? ""}
						placeholder="Not set"
						onChange={(cc) => save({ ...birth, birthCountry: cc || null })}
					/>
					<DateField
						label="Birth date"
						value={typed}
						onChange={(d) => {
							setTyped(d);
							if (d === "" || isIsoDate(d))
								save({ ...birth, birth: d === "" ? null : d });
						}}
					/>
				</div>
			) : (
				<p>Loading…</p>
			)}
			{error ? <p role="alert">{error}</p> : null}
		</Card>
	);
}
