import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
	addStay,
	canSplitAt,
	clearStayIds,
	type LegacyTrip,
	legacyTripStays,
	mergeKept,
	type NewStay,
	resuggestStay,
	type StayGap,
	splitStay,
	stayCounts,
	stayHints,
	staySpan,
	type TravelStay,
	usableStamps,
} from "@voyput/core";
import { Button, Notice, SkyHeader, Stack } from "@voyput/ui";
import { liveQuery } from "dexie";
import {
	type CSSProperties,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useDb } from "../../db/DbContext";
import { EMPTY_EDITS, editReducer, type Snapshot } from "./editHistory";
import {
	addDays,
	countryName,
	dayCount,
	flagOf,
	localToday,
	longDay,
	plural,
	stayRange,
} from "./format";
import { LegacyTrips } from "./LegacyTrips";
import { MoreMenu } from "./MoreMenu";
import { buildPhotoDays } from "./photoDays";
import { type ReviewQueue, StayDetail } from "./StayDetail";
import { AddStayForm } from "./StayForms";
import { STATUS_NAMES, StayRow, type StayStatus } from "./StayRow";
import { defaultOpenYears, type Item, yearGroups } from "./stayGroups";
import "./trips.css";
import {
	historyOf,
	loadTripsData,
	type StayOrder,
	sameStays,
	saveLegacyTrips,
	saveOrder,
	saveStayChanges,
	suggestHistory,
	type TripsData,
} from "./tripStore";
import { type ToastMessage, UndoToast } from "./UndoToast";

/** Days no stay covers between two stays: just a gap, with a button to fill it. */
function GapRow({
	gap,
	onAdd,
	below,
}: {
	gap: StayGap;
	onAdd: () => void;
	below?: ReactNode;
}) {
	return (
		<div className="vp-stay-block">
			<div className="vp-stay-gap">
				<span className="vp-stay-gap-label">
					gap · {plural(gap.days, "day")}
				</span>
				<span className="vp-trips-muted">
					{stayRange(addDays(gap.from, 1), addDays(gap.to, -1))}
				</span>
				<Button
					size="sm"
					variant="ghost"
					aria-label={`Add a stay in the gap of ${plural(gap.days, "day")}`}
					onClick={onAdd}
				>
					+ Add stay
				</Button>
			</div>
			{below}
		</div>
	);
}

/** A new stay's form open in the list: at the top (`top`) or in a gap (`gap-<stay id>`). */
type OpenForm = {
	at: string;
	initial: { countryCode: string; arrival: string; departure: string };
} | null;

/** A day in the middle of a stay, to start the split form at. */
function middleDay(stay: TravelStay, birth: string | null, today: string) {
	const { start, end } = staySpan(stay, birth, today);
	if (end === null) return today;
	if (start === null || start >= end) return addDays(end, -1);
	return addDays(
		start,
		Math.max(1, Math.floor((dayCount(start, end) - 1) / 2)),
	);
}

/** Typing in a field keeps the browser's own undo. */
const isTyping = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

const staysWord = (n: number) => plural(n, "stay");

/** Where the open stay is in the review queue, and the stay after it (wrapping). */
function reviewQueue(
	queue: readonly string[],
	openId: string,
	actions: {
		approveNext: (saved: TravelStay, next: string | null) => void;
		skip: (next: string) => void;
	},
): ReviewQueue | undefined {
	const at = queue.indexOf(openId);
	if (at < 0) return undefined;
	const rest = [...queue.slice(at + 1), ...queue.slice(0, at)];
	const next = rest[0] ?? null;
	return {
		position: at + 1,
		total: queue.length,
		onApproveNext: (saved) => actions.approveNext(saved, next),
		onSkip: next ? () => actions.skip(next) : undefined,
	};
}

/** With no stay open: the first one to check, or the way to the results. */
function NextToCheck({
	stay,
	status,
	left,
	unapproved,
	birth,
	onOpen,
}: {
	stay: TravelStay | undefined;
	status: StayStatus | undefined;
	left: number;
	/** Stays not approved yet; with the queue empty, all of them are ready. */
	unapproved: number;
	birth: string | null;
	onOpen: () => void;
}) {
	const travels = (
		<Link to="/insights/$view" params={{ view: "journey" }}>
			See my travels →
		</Link>
	);
	if (!stay)
		return (
			<p>
				{unapproved === 0
					? "Every stay is approved."
					: `Nothing to check: ${plural(unapproved, "stay")} ready to approve, the rest approved.`}{" "}
				{travels}
			</p>
		);
	return (
		<div className="vp-trips-next">
			<p>
				<strong>{plural(left, "stay")} to check.</strong> Next:{" "}
				<span aria-hidden="true">{flagOf(stay.countryCode)}</span>{" "}
				{countryName(stay.countryCode)},{" "}
				{stayRange(stay.arrival.date ?? birth, stay.departure.date)}
				{status ? ` · ${STATUS_NAMES[status]}` : ""}
			</p>
			<Button variant="primary" onClick={onOpen}>
				Check the first one →
			</Button>
			<p className="vp-trips-muted">
				Or skip the review: Insights already use these stays. {travels}
			</p>
		</div>
	);
}

export function TripsPage() {
	const db = useDb();
	const [data, setData] = useState<TripsData | null>(null);
	const [stored, setStored] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [edits, dispatch] = useReducer(editReducer, EMPTY_EDITS);
	const { stays, birth, birthCountry } = edits;
	const [form, setForm] = useState<OpenForm>(null);
	const [order, setOrder] = useState<StayOrder>("newest");
	/** Years the user opened (true) or folded (false); the rest follow the default. */
	const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(new Map());
	const [toast, setToast] = useState<ToastMessage | null>(null);
	const toastId = useRef(0);
	/** Saves the open stay's pending edit; set by `StayDetail`. */
	const flushDetail = useRef<(() => void) | null>(null);
	/** Height of the sticky action bar: year headers stick right under it. */
	const [barHeight, setBarHeight] = useState(0);
	const barObserver = useRef<ResizeObserver | null>(null);
	const barRef = useCallback((bar: HTMLDivElement | null) => {
		barObserver.current?.disconnect();
		if (!bar || typeof ResizeObserver === "undefined") return;
		barObserver.current = new ResizeObserver(() =>
			setBarHeight(bar.offsetHeight),
		);
		barObserver.current.observe(bar);
	}, []);
	/** The selected stay lives in the URL (`/collect/trips/<id>`); an unknown id selects nothing. */
	const selectedId = useParams({ strict: false }).tripId ?? null;
	const navigate = useNavigate();
	const select = (id: string | null) =>
		void navigate(
			id
				? { to: "/collect/trips/$tripId", params: { tripId: id } }
				: { to: "/collect/$step", params: { step: "trips" } },
		);
	const fail = useCallback(
		(e: unknown) => setError(e instanceof Error ? e.message : String(e)),
		[],
	);
	const say = useCallback(
		(text: string, action: ToastMessage["action"]) =>
			setToast({ id: ++toastId.current, text, action }),
		[],
	);
	const closeToast = useCallback(() => setToast(null), []);

	/** The history as last read from or saved to the database: what the next save diffs against. */
	const saved = useRef<TravelStay[]>([]);
	/** Histories this page saved and has not seen come back from the database yet. */
	const written = useRef<TravelStay[][]>([]);
	/** Saves run one after another, in edit order. */
	const saving = useRef<Promise<void>>(Promise.resolve());
	const savedVersion = useRef(0);
	const loads = useRef(0);

	/** Reads everything again and starts a fresh undo history: nothing stale comes back. */
	const load = useCallback(() => {
		const at = ++loads.current;
		loadTripsData(db)
			.then((loaded) => {
				if (at !== loads.current) return;
				saved.current = loaded.stored;
				written.current = [];
				setData(loaded);
				setStored(loaded.stored.length > 0);
				setOrder(loaded.order);
				setToast(null);
				dispatch({
					type: "load",
					snapshot: {
						stays: historyOf(loaded),
						birth: loaded.birth,
						birthCountry: loaded.birthCountry,
					},
				});
			})
			.catch(fail);
	}, [db, fail]);

	// Loads on open, and again whenever stays change outside this page:
	// Review, Import, Settings, the demo, or another tab (ADR 0036).
	useEffect(() => {
		let first = true;
		const subscription = liveQuery(() => db.stays.toArray()).subscribe({
			next: (rows) => {
				const own = written.current.findIndex((w) => sameStays(w, rows));
				if (own >= 0) written.current = written.current.slice(own + 1);
				if (!first && (own >= 0 || sameStays(rows, saved.current))) return;
				first = false;
				load();
			},
			error: fail,
		});
		return () => {
			loads.current++;
			subscription.unsubscribe();
		};
	}, [db, load, fail]);

	// Every edit, undo and redo is saved as a diff; loading is not.
	const { version } = edits;
	useEffect(() => {
		if (version === savedVersion.current) return;
		savedVersion.current = version;
		const before = saved.current;
		saved.current = stays;
		written.current.push(stays);
		saving.current = saving.current
			.then(() => saveStayChanges(db, before, stays))
			.then(() => setStored(true))
			.catch(fail);
	}, [db, version, stays, fail]);

	const canUndo = edits.past.length > 0;
	const canRedo = edits.future.length > 0;
	const undo = useCallback(() => {
		if (!canUndo) return;
		dispatch({ type: "undo" });
		say("Undone", "redo");
	}, [canUndo, say]);
	const redo = useCallback(() => {
		if (!canRedo) return;
		dispatch({ type: "redo" });
		say("Redone", "undo");
	}, [canRedo, say]);

	// Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, outside text fields.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target)) return;
			const key = e.key.toLowerCase();
			if (key === "z" && !e.shiftKey) undo();
			else if ((key === "z" && e.shiftKey) || key === "y") redo();
			else return;
			e.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [undo, redo]);

	/** Records a change for undo, saves it, and says what changed. */
	const edit = (snapshot: Partial<Snapshot>, text: string) => {
		dispatch({
			type: "edit",
			snapshot: { stays, birth, birthCountry, ...snapshot },
		});
		say(text, "undo");
	};
	/** A stay the user changed: a rebuild keeps it. */
	const change = (stay: TravelStay) => {
		const before = stays.find((s) => s.id === stay.id);
		const name = countryName(stay.countryCode);
		edit(
			{
				stays: stays.map((s) =>
					s.id === stay.id ? { ...stay, edited: true } : s,
				),
			},
			before && before.approved !== stay.approved
				? `${stay.approved ? "Approved" : "Reopened"} ${name}`
				: `Changed ${name}`,
		);
	};

	const today = localToday();
	const usable = useMemo(() => usableStamps(data?.stamps ?? []), [data]);
	const hints = useMemo(
		() =>
			stayHints(stays, {
				stamps: usable,
				passports: data?.passports ?? [],
				birth,
			}),
		[stays, usable, data, birth],
	);
	const counts = stayCounts(stays, hints);
	const evidenceDays = useMemo(
		() => ({
			stamps: new Map(usable.map((s) => [s.id, s.date])),
			photos: new Map(
				(data?.locations ?? []).map((r) => [r.uuid, r.date.slice(0, 10)]),
			),
		}),
		[usable, data],
	);
	const clear = clearStayIds(stays, hints, birth, evidenceDays.photos);
	const statuses: StayStatus[] = stays.map((s, i) =>
		s.evidenceChanged
			? "changed"
			: hints[i]?.some((h) => h.severity === "error")
				? "error"
				: s.approved || clear.includes(s.id)
					? "ok"
					: "check",
	);
	const toCheck = statuses.filter(
		(st, i) => st === "check" && !stays[i]?.approved,
	).length;
	/**
	 * Stays still to look at one by one, in list order: not approved and not
	 * ready, and approved ones that since got an error or changed evidence.
	 */
	const queue = stays.filter((_, i) => statuses[i] !== "ok").map((s) => s.id);
	if (order === "newest") queue.reverse();
	const photoDays = useMemo(
		() => buildPhotoDays(data?.locations ?? []),
		[data],
	);
	const countries = new Set(
		stays.filter((s) => s.kind === "stay").map((s) => s.countryCode),
	);

	const changeOrder = (next: StayOrder) => {
		setOrder(next);
		saveOrder(db, next).catch(fail);
	};
	const approveClear = () =>
		edit(
			{
				stays: stays.map((s) =>
					clear.includes(s.id) ? { ...s, approved: true } : s,
				),
			},
			`Approved ${staysWord(clear.length)}`,
		);
	// Approved and edited stays stay as they are; the rest is suggested again.
	const rebuild = () =>
		loadTripsData(db)
			.then((fresh) => {
				setData(fresh);
				edit(
					{
						stays: suggestHistory(
							{ ...fresh, birth, birthCountry },
							stays.filter((s) => s.approved || s.edited),
						),
					},
					"Rebuilt suggestions",
				);
			})
			.catch(fail);
	// A stay whose stamps or photos changed: suggested again within its days, the rest stays.
	const resuggest = (stay: TravelStay) =>
		loadTripsData(db)
			.then((fresh) => {
				setData(fresh);
				if (stay.id === selectedId) select(null);
				edit(
					{
						stays: resuggestStay(stays, stay.id, {
							...fresh,
							birth,
							birthCountry,
						}),
					},
					`Re-suggested ${countryName(stay.countryCode)}`,
				);
			})
			.catch(fail);
	const keepAsIs = (stay: TravelStay) => {
		const { evidenceChanged: _, ...kept } = stay;
		edit(
			{
				stays: stays.map((s) =>
					s.id === stay.id ? { ...kept, edited: true } : s,
				),
			},
			`Kept ${countryName(stay.countryCode)} as is`,
		);
	};
	const add = (stay: NewStay) => {
		const next = addStay(stays, stay);
		edit({ stays: next.stays }, `Added ${countryName(stay.countryCode)}`);
		setForm(null);
		select(next.id);
	};
	const openAdd = (
		at: string,
		arrival: string | null,
		departure: string | null,
	) =>
		setForm({
			at,
			initial: {
				countryCode: "",
				arrival: arrival ?? "",
				departure: departure ?? "",
			},
		});
	const addForm = (at: string) =>
		form?.at === at ? (
			<AddStayForm
				initial={form.initial}
				onAdd={add}
				onCancel={() => setForm(null)}
			/>
		) : null;
	const latest = stays.at(-1);

	const dropLegacy = (trip: LegacyTrip) => {
		if (!data) return;
		const legacy = data.legacy.filter((t) => t.id !== trip.id);
		setData({ ...data, legacy });
		saveLegacyTrips(db, legacy).catch(fail);
	};
	const addLegacy = (trip: LegacyTrip, country: string) => {
		edit(
			{ stays: mergeKept(stays, legacyTripStays(trip, country)) },
			`Added ${countryName(country)}`,
		);
		dropLegacy(trip);
	};

	/**
	 * Closes the open stay or opens another (row, arrows, swipe, backdrop,
	 * Close), saving first what the open stay still holds unsaved: a swipe
	 * can end while the place field keeps focus, so blur cannot be relied on.
	 */
	const leaveFor = (id: string | null) => {
		flushDetail.current?.();
		select(id);
	};

	const index = stays.findIndex((s) => s.id === selectedId);
	const selected = stays[index];
	const groups = yearGroups(stays, order, birth, today);
	const openByDefault = defaultOpenYears(groups);
	const listItem = (item: Item) => {
		if (item.kind === "gap") {
			const at = `gap-${stays[item.after]?.id}`;
			return (
				<GapRow
					key={at}
					gap={item.gap}
					onAdd={() => openAdd(at, item.gap.from, item.gap.to)}
					below={addForm(at)}
				/>
			);
		}
		const stay = stays[item.index] as TravelStay;
		const row = (
			<StayRow
				key={stay.id}
				stay={stay}
				number={item.index + 1}
				status={statuses[item.index] ?? "check"}
				birth={birth}
				today={today}
				selected={stay.id === selectedId}
				onSelect={() => leaveFor(stay.id === selectedId ? null : stay.id)}
			/>
		);
		if (!stay.evidenceChanged) return row;
		const name = countryName(stay.countryCode);
		return (
			<div key={stay.id} className="vp-stay-block">
				{row}
				<div className="vp-stay-evidence">
					<span>A stamp or photo of this stay was deleted or edited.</span>
					<Button
						size="sm"
						variant="ghost"
						aria-label={`Re-suggest ${name} from the evidence`}
						onClick={() => void resuggest(stay)}
					>
						Re-suggest this stay
					</Button>
					<Button
						size="sm"
						variant="ghost"
						aria-label={`Keep ${name} as is`}
						onClick={() => keepAsIs(stay)}
					>
						Keep as is
					</Button>
				</div>
			</div>
		);
	};

	if (!data) return error ? <p role="alert">{error}</p> : <p>Loading…</p>;

	return (
		<Stack>
			<SkyHeader title="Stays" art="passport" />
			<div className="vp-stays-bar" ref={barRef}>
				{/* On phones only "ready" and errors show; the rest stays for screen readers. */}
				<p className="vp-stays-summary" aria-live="polite">
					<strong>{clear.length} ready</strong>
					<span className="vp-stays-wide">
						<span aria-hidden="true"> · </span>
						{toCheck} to check
					</span>
					<span className={counts.withErrors > 0 ? undefined : "vp-stays-wide"}>
						<span aria-hidden="true"> · </span>
						<span data-bad={counts.withErrors > 0 || undefined}>
							{plural(counts.withErrors, "error")}
						</span>
					</span>
					{counts.approved > 0 ? (
						<span className="vp-trips-muted vp-stays-wide">
							<span aria-hidden="true"> · </span>
							{counts.approved} approved
						</span>
					) : null}
				</p>
				<Button
					size="sm"
					variant="ghost"
					onClick={() =>
						openAdd(
							"top",
							latest ? (latest.departure.date ?? today) : today,
							null,
						)
					}
				>
					<span>
						+ Add <span className="vp-stays-wide">stay</span>
					</span>
				</Button>
				{clear.length > 0 ? (
					<Button
						size="sm"
						variant="primary"
						title="Approve stays whose edges a stamp, your edit or photos on both sides confirm, without errors"
						onClick={approveClear}
					>
						✓ Approve {clear.length}
					</Button>
				) : null}
				{/* Insights already use every stay, approved or not: review can wait. */}
				<Link
					to="/insights/$view"
					params={{ view: "journey" }}
					className="vp-button"
					data-variant={clear.length > 0 ? "ghost" : "primary"}
					data-size="sm"
				>
					<span>
						See <span className="vp-stays-wide">my </span>travels →
					</span>
				</Link>
				<MoreMenu
					label="More stay actions"
					items={[
						{
							label: "Newest first",
							checked: order === "newest",
							onSelect: () => changeOrder("newest"),
						},
						{
							label: "Oldest first",
							checked: order === "oldest",
							onSelect: () => changeOrder("oldest"),
						},
						{ label: "Undo", disabled: !canUndo, onSelect: undo },
						{ label: "Redo", disabled: !canRedo, onSelect: redo },
						{
							label: "Rebuild suggestions",
							note: "Keeps approved and edited stays",
							onSelect: () => void rebuild(),
						},
					]}
				/>
			</div>
			{error ? <p role="alert">{error}</p> : null}
			{stored ? null : stays.length > 0 ? (
				<p className="vp-trips-muted vp-stays-note">
					Suggested from your reviewed stamps and photo locations. Your first
					change saves it.
				</p>
			) : (
				<Notice>
					No reviewed stamps or photo locations yet, so there is nothing to
					suggest. Review stamps, import your iPhone photo locations or add a
					stay by hand.
				</Notice>
			)}

			{stays.length > 0 && !selected ? (
				// Narrow screens have no panel beside the list: the next stay goes above it.
				<div className="vp-trips-note vp-trips-next-narrow">
					<NextToCheck
						stay={stays.find((s) => s.id === queue[0])}
						status={statuses[stays.findIndex((s) => s.id === queue[0])]}
						left={queue.length}
						unapproved={counts.left}
						birth={birth}
						onOpen={() => leaveFor(queue[0] ?? null)}
					/>
				</div>
			) : null}

			<LegacyTrips
				trips={data.legacy}
				onAdd={addLegacy}
				onForget={dropLegacy}
			/>

			<div
				className="vp-trips-layout"
				data-open={selected ? true : undefined}
				style={{ "--vp-stays-bar-h": `${barHeight}px` } as CSSProperties}
			>
				<div className="vp-stays">
					{addForm("top")}
					{groups.map((group) => {
						const holdsSelected = group.items.some(
							(it) => it.kind === "stay" && it.index === index,
						);
						const open =
							folds.get(group.year) ??
							(openByDefault.has(group.year) || holdsSelected);
						const first = group.items[0];
						const key = `${group.year}-${first?.kind === "stay" ? first.index : `g${first?.after}`}`;
						return (
							<section
								key={key}
								className="vp-stays-year"
								aria-label={group.year}
							>
								<h3 className="vp-stays-year-head">
									<button
										type="button"
										aria-expanded={open}
										onClick={() =>
											setFolds(new Map(folds).set(group.year, !open))
										}
									>
										<span aria-hidden="true">{open ? "▾" : "▸"}</span>
										<span>{group.year}</span>
										<span className="vp-trips-muted">
											{staysWord(group.stays)}
										</span>
									</button>
								</h3>
								{open ? group.items.map(listItem) : null}
							</section>
						);
					})}
				</div>
				{selected ? (
					// Behind the bottom sheet on narrow screens: a tap closes it.
					<div
						className="vp-trips-backdrop"
						aria-hidden="true"
						onClick={() => leaveFor(null)}
					/>
				) : null}
				<div className="vp-trips-pane" data-sheet={selected ? true : undefined}>
					{selected ? (
						<StayDetail
							key={selected.id}
							stay={selected}
							number={index + 1}
							previous={stays[index - 1]}
							next={stays[index + 1]}
							hints={hints[index] ?? []}
							birth={birth}
							today={today}
							photoDays={photoDays}
							usable={usable}
							stamps={data.stamps}
							split={{
								initial: middleDay(selected, birth, today),
								valid: (date) => canSplitAt(selected, date),
								onSplit: (date) =>
									edit(
										{
											stays: splitStay(stays, selected.id, date, evidenceDays),
										},
										`Split ${countryName(selected.countryCode)}`,
									),
							}}
							addAfter={{
								initial: {
									countryCode: "",
									arrival: selected.departure.date ?? today,
									departure: stays[index + 1]?.arrival.date ?? "",
								},
								onAdd: add,
							}}
							onChange={change}
							onDelete={() => {
								select(null);
								edit(
									{ stays: stays.filter((s) => s.id !== selected.id) },
									`Deleted ${countryName(selected.countryCode)}`,
								);
							}}
							onClose={() => leaveFor(null)}
							flushRef={flushDetail}
							queue={reviewQueue(queue, selected.id, {
								// The panel hands over the stay with its unsaved place: no flush here.
								approveNext: (saved, next) => {
									change(saved);
									select(next);
								},
								skip: (next) => leaveFor(next),
							})}
							onPrevious={
								index > 0
									? () => leaveFor(stays[index - 1]?.id ?? null)
									: undefined
							}
							onNext={
								index < stays.length - 1
									? () => leaveFor(stays[index + 1]?.id ?? null)
									: undefined
							}
						/>
					) : stays.length > 0 ? (
						<div className="vp-trips-empty">
							<p>
								<strong>{staysWord(stays.length)}</strong> ·{" "}
								{plural(countries.size, "country", "countries")} ·{" "}
								{counts.approved} approved
							</p>
							<NextToCheck
								stay={stays.find((s) => s.id === queue[0])}
								status={statuses[stays.findIndex((s) => s.id === queue[0])]}
								left={queue.length}
								unapproved={counts.left}
								birth={birth}
								onOpen={() => leaveFor(queue[0] ?? null)}
							/>
							<p>
								{birth && birthCountry ? (
									<>
										Born in{" "}
										<span aria-hidden="true">{flagOf(birthCountry)}</span>{" "}
										{countryName(birthCountry)} · {longDay(birth)}.{" "}
									</>
								) : (
									"Your birth country and date start the history with a stay since birth. "
								)}
								<Link to="/settings">Change in Settings</Link>
							</p>
						</div>
					) : null}
				</div>
			</div>
			{toast ? (
				<UndoToast
					message={toast}
					onAction={(action) => (action === "undo" ? undo() : redo())}
					onClose={closeToast}
				/>
			) : null}
		</Stack>
	);
}
