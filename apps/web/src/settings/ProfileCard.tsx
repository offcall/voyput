import { isIsoDate } from "@voyput/core";
import { Card, PixelArt } from "@voyput/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type Birth,
	type BirthSnapshot,
	changeBirth,
	type HomeFill,
	loadBirth,
	loadHomeFill,
	restoreBirth,
	saveHomeFill,
} from "../data/profile";
import { useDb } from "../db/DbContext";
import { DateField } from "../features/trips/DateField";
import { CountrySelect } from "../features/trips/StayForms";
import { type ToastMessage, UndoToast } from "../features/trips/UndoToast";

/** Undo steps kept, as on the Stays step. */
const LIMIT = 50;

/** What one change replaced: the birth setting with its stays, or the fill of unknown days. */
type Entry =
	| { kind: "birth"; snapshot: BirthSnapshot }
	| { kind: "fill"; fill: HomeFill };

/**
 * Birth country and date: with both set, the history starts with a stay there
 * since birth. Each change can be undone with the stays it changed. Unknown
 * days can be assumed in a home country (ADR 0051), off by default.
 */
export function ProfileCard() {
	const db = useDb();
	const [birth, setBirth] = useState<Birth | null>(null);
	const [fill, setFill] = useState<HomeFill | null>(null);
	const [typed, setTyped] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastId = useRef(0);
	/** What each change replaced (Undo) and what each undo replaced (Redo). */
	const history = useRef<{ past: Entry[]; future: Entry[] }>({
		past: [],
		future: [],
	});
	/** Writes run one after another, so the history keeps their order. */
	const queue = useRef<Promise<unknown>>(Promise.resolve());
	const fail = useCallback((e: unknown) => setError(String(e)), []);
	const closeToast = useCallback(() => setToast(null), []);

	useEffect(() => {
		let alive = true;
		Promise.all([loadBirth(db), loadHomeFill(db)]).then(([loaded, home]) => {
			if (!alive) return;
			setBirth(loaded);
			setTyped(loaded.birth ?? "");
			setFill(home);
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
			remember({ kind: "birth", snapshot: before });
		});
	};
	const saveFill = (next: HomeFill, text: string) => {
		if (!fill) return;
		const before = fill;
		setFill(next);
		say(text, "undo");
		run(async () => {
			await saveHomeFill(db, next);
			remember({ kind: "fill", fill: before });
		});
	};
	const remember = (entry: Entry) => {
		const h = history.current;
		h.past = [...h.past, entry].slice(-LIMIT);
		h.future = [];
	};
	/** Puts an entry back; returns what it replaced. */
	const restore = async (target: Entry): Promise<Entry> => {
		if (target.kind === "fill") {
			const replaced = await loadHomeFill(db);
			await saveHomeFill(db, target.fill);
			setFill(target.fill);
			return { kind: "fill", fill: replaced };
		}
		const replaced = await restoreBirth(db, target.snapshot);
		const { birth, birthCountry } = target.snapshot;
		setBirth({ birth, birthCountry });
		setTyped(birth ?? "");
		return { kind: "birth", snapshot: replaced };
	};
	const step = (action: ToastMessage["action"]) =>
		run(async () => {
			const h = history.current;
			const from = action === "undo" ? h.past : h.future;
			const target = from.at(-1);
			if (!target) return;
			const replaced = await restore(target);
			if (action === "undo") {
				h.past = h.past.slice(0, -1);
				h.future = [...h.future, replaced];
			} else {
				h.future = h.future.slice(0, -1);
				h.past = [...h.past, replaced];
			}
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
			{fill ? (
				<div className="settings-profile">
					<CountrySelect
						label="Fill unknown days with"
						value={fill.assumedHome ?? ""}
						placeholder="Nothing"
						onChange={(cc) =>
							saveFill(
								{ ...fill, assumedHome: cc || null },
								cc
									? "Unknown days assumed at home"
									: "Unknown days left unknown",
							)
						}
					/>
					<label className="settings-check">
						<input
							type="checkbox"
							checked={fill.countAssumed}
							disabled={!fill.assumedHome}
							onChange={(e) =>
								saveFill(
									{ ...fill, countAssumed: e.target.checked },
									e.target.checked
										? "Insights count assumed days"
										: "Insights leave assumed days out",
								)
							}
						/>
						<span>Count assumed days</span>
					</label>
					<p className="vp-field-description">
						Days between stays and after the last one show as this country,
						marked assumed. They are never saved as stays, never fill a gap with
						a stamp, and never count as days abroad. Counted, Insights add them
						to the country's days.
					</p>
				</div>
			) : null}
			{error ? <p role="alert">{error}</p> : null}
			{toast ? (
				<UndoToast message={toast} onAction={step} onClose={closeToast} />
			) : null}
		</Card>
	);
}
