import { isIsoDate } from "@voyput/core";
import { Card, PixelArt } from "@voyput/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDb } from "../db/DbContext";
import { DateField } from "../features/trips/DateField";
import { CountrySelect } from "../features/trips/StayForms";
import {
	type Birth,
	type BirthSnapshot,
	changeBirth,
	loadBirth,
	restoreBirth,
} from "../features/trips/tripStore";
import { type ToastMessage, UndoToast } from "../features/trips/UndoToast";

/** Undo steps kept, as on the Stays step. */
const LIMIT = 50;

/**
 * Birth country and date: with both set, the history starts with a stay there
 * since birth. Each change can be undone with the stays it changed.
 */
export function ProfileCard() {
	const db = useDb();
	const [birth, setBirth] = useState<Birth | null>(null);
	const [typed, setTyped] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastId = useRef(0);
	/** What each change replaced (Undo) and what each undo replaced (Redo). */
	const history = useRef<{ past: BirthSnapshot[]; future: BirthSnapshot[] }>({
		past: [],
		future: [],
	});
	/** Writes run one after another, so the history keeps their order. */
	const queue = useRef<Promise<unknown>>(Promise.resolve());
	const fail = useCallback((e: unknown) => setError(String(e)), []);
	const closeToast = useCallback(() => setToast(null), []);

	useEffect(() => {
		let alive = true;
		loadBirth(db).then((loaded) => {
			if (!alive) return;
			setBirth(loaded);
			setTyped(loaded.birth ?? "");
		}, fail);
		return () => {
			alive = false;
		};
	}, [db, fail]);

	const say = (text: string, action: ToastMessage["action"]) =>
		setToast({ id: ++toastId.current, text, action });
	const run = (task: () => Promise<void>) => {
		queue.current = queue.current.then(task).catch(fail);
	};

	const save = (next: Birth, text: string) => {
		setBirth(next);
		say(text, "undo");
		run(async () => {
			const before = await changeBirth(db, next);
			const h = history.current;
			h.past = [...h.past, before].slice(-LIMIT);
			h.future = [];
		});
	};
	const step = (action: ToastMessage["action"]) =>
		run(async () => {
			const h = history.current;
			const from = action === "undo" ? h.past : h.future;
			const target = from.at(-1);
			if (!target) return;
			const replaced = await restoreBirth(db, target);
			if (action === "undo") {
				h.past = h.past.slice(0, -1);
				h.future = [...h.future, replaced];
			} else {
				h.future = h.future.slice(0, -1);
				h.past = [...h.past, replaced];
			}
			setBirth({ birth: target.birth, birthCountry: target.birthCountry });
			setTyped(target.birth ?? "");
			say(
				action === "undo" ? "Undone" : "Redone",
				action === "undo" ? "redo" : "undo",
			);
		});

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
						onChange={(cc) =>
							save(
								{ ...birth, birthCountry: cc || null },
								cc ? "Saved birth country" : "Cleared birth country",
							)
						}
					/>
					<DateField
						label="Birth date"
						value={typed}
						onChange={(d) => {
							setTyped(d);
							if (d === "" || isIsoDate(d))
								save(
									{ ...birth, birth: d === "" ? null : d },
									d ? "Saved birth date" : "Cleared birth date",
								);
						}}
					/>
				</div>
			) : (
				<p>Loading…</p>
			)}
			{error ? <p role="alert">{error}</p> : null}
			{toast ? (
				<UndoToast message={toast} onAction={step} onClose={closeToast} />
			) : null}
		</Card>
	);
}
