import { useNavigate, useParams } from "@tanstack/react-router";
import {
	addStay,
	canSplitAt,
	clearStayIds,
	gapBetween,
	isIsoDate,
	type LegacyTrip,
	legacyTripStays,
	mergeKept,
	type NewStay,
	type StayGap,
	splitStay,
	stayCounts,
	stayHints,
	staySpan,
	type TravelStay,
	usableStamps,
	withBirthStay,
} from "@voyput/core";
import {
	Button,
	Notice,
	Stack,
	Stat,
	StatGroup,
	Toolbar,
	ToolbarSpacer,
} from "@voyput/ui";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useState,
} from "react";
import { useDb } from "../../db/DbContext";
import { DateField } from "./DateField";
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
import { buildPhotoDays } from "./photoDays";
import { StayDetail } from "./StayDetail";
import { AddStayForm, CountrySelect, SplitForm } from "./StayForms";
import { StayRow } from "./StayRow";
import "./trips.css";
import {
	historyOf,
	loadTripsData,
	type StayOrder,
	saveBirth,
	saveLegacyTrips,
	saveOrder,
	saveStays,
	suggestHistory,
	type TripsData,
} from "./tripStore";

interface Birth {
	birth: string | null;
	birthCountry: string | null;
}

/** "Born in 🇲🇩 Moldova · 21 May 1997": with both set, the first stay is there since birth. */
function BirthSetting({
	value,
	onChange,
}: {
	value: Birth;
	onChange: (birth: Birth) => void;
}) {
	const [open, setOpen] = useState(false);
	const { birth, birthCountry } = value;
	if (!open)
		return (
			<p className="vp-stays-born">
				<span>Born in </span>
				{birthCountry ? (
					<strong>
						<span aria-hidden="true">{flagOf(birthCountry)}</span>{" "}
						{countryName(birthCountry)}
					</strong>
				) : (
					<span className="vp-trips-muted">no country set</span>
				)}
				<span aria-hidden="true"> · </span>
				{birth ? (
					<strong>{longDay(birth)}</strong>
				) : (
					<span className="vp-trips-muted">no date set</span>
				)}
				<span aria-hidden="true"> · </span>
				<button
					type="button"
					className="vp-stays-link"
					onClick={() => setOpen(true)}
				>
					{birth || birthCountry ? "change" : "set"}
				</button>
			</p>
		);
	return (
		<div className="vp-stays-born-pick">
			<CountrySelect
				label="Birth country"
				value={birthCountry ?? ""}
				placeholder="Not set"
				onChange={(cc) => onChange({ birth, birthCountry: cc || null })}
			/>
			<DateField
				label="Birth date"
				value={birth ?? ""}
				onChange={(d) => {
					if (d === "" || isIsoDate(d))
						onChange({ birthCountry, birth: d === "" ? null : d });
				}}
			/>
			<Button size="sm" onClick={() => setOpen(false)}>
				Done
			</Button>
			<span className="vp-trips-muted">
				With both set, your history starts with a stay there since birth.
			</span>
		</div>
	);
}

/** "Newest first" / "Oldest first". */
function OrderToggle({
	order,
	onChange,
}: {
	order: StayOrder;
	onChange: (order: StayOrder) => void;
}) {
	const option = (value: StayOrder, label: string) => (
		<Button
			size="sm"
			variant={order === value ? "secondary" : "ghost"}
			aria-pressed={order === value}
			onClick={() => onChange(value)}
		>
			{label}
		</Button>
	);
	return (
		<fieldset className="vp-stays-order" aria-label="Order">
			{option("newest", "Newest first")}
			{option("oldest", "Oldest first")}
		</fieldset>
	);
}

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

/** A form open in the list: a split of one stay, or a new stay at one place. */
type OpenForm =
	| { kind: "split"; id: string }
	| {
			kind: "add";
			/** Where it opened: `top`, `after-<stay id>` or `gap-<stay id>`. */
			at: string;
			initial: { countryCode: string; arrival: string; departure: string };
	  }
	| null;

/** The list in chronological order: stays, and gaps between them. */
type Item =
	| { kind: "stay"; index: number }
	| { kind: "gap"; after: number; gap: StayGap };

function itemsOf(stays: readonly TravelStay[]): Item[] {
	const items: Item[] = [];
	stays.forEach((stay, index) => {
		const prev = stays[index - 1];
		const gap = prev ? gapBetween(prev, stay) : null;
		if (gap) items.push({ kind: "gap", after: index - 1, gap });
		items.push({ kind: "stay", index });
	});
	return items;
}

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

export function TripsPage() {
	const db = useDb();
	const [data, setData] = useState<TripsData | null>(null);
	const [stored, setStored] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [edits, dispatch] = useReducer(editReducer, EMPTY_EDITS);
	const { stays, birth, birthCountry } = edits;
	const [form, setForm] = useState<OpenForm>(null);
	const [order, setOrder] = useState<StayOrder>("newest");
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

	useEffect(() => {
		let alive = true;
		loadTripsData(db)
			.then((loaded) => {
				if (!alive) return;
				setData(loaded);
				setStored(loaded.stored.length > 0);
				setOrder(loaded.order);
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
		return () => {
			alive = false;
		};
	}, [db, fail]);

	// Every edit, undo and redo is saved; loading is not.
	const { version } = edits;
	useEffect(() => {
		if (version === 0) return;
		Promise.all([saveStays(db, stays), saveBirth(db, { birth, birthCountry })])
			.then(() => setStored(true))
			.catch(fail);
	}, [db, version, stays, birth, birthCountry, fail]);

	const edit = (snapshot: Partial<Snapshot>) =>
		dispatch({
			type: "edit",
			snapshot: { stays, birth, birthCountry, ...snapshot },
		});
	/** A stay the user changed: a rebuild keeps it. */
	const change = (stay: TravelStay) =>
		edit({
			stays: stays.map((s) =>
				s.id === stay.id ? { ...stay, edited: true } : s,
			),
		});

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
	const clear = clearStayIds(stays, hints, birth);
	const photoDays = useMemo(
		() => buildPhotoDays(data?.locations ?? []),
		[data],
	);
	const evidenceDays = useMemo(
		() => ({
			stamps: new Map(usable.map((s) => [s.id, s.date])),
			photos: new Map(
				(data?.locations ?? []).map((r) => [r.uuid, r.date.slice(0, 10)]),
			),
		}),
		[usable, data],
	);
	const countries = new Set(
		stays.filter((s) => s.kind === "stay").map((s) => s.countryCode),
	);

	const setBirth = (next: Birth) =>
		edit({ ...next, stays: withBirthStay(stays, next) });
	const changeOrder = (next: StayOrder) => {
		setOrder(next);
		saveOrder(db, next).catch(fail);
	};
	// Approved and edited stays stay as they are; the rest is suggested again.
	const rebuild = () =>
		loadTripsData(db)
			.then((fresh) => {
				setData(fresh);
				edit({
					stays: suggestHistory(
						{ ...fresh, birth, birthCountry },
						stays.filter((s) => s.approved || s.edited),
					),
				});
			})
			.catch(fail);
	const add = (stay: NewStay) => {
		const next = addStay(stays, stay);
		edit({ stays: next.stays });
		setForm(null);
		select(next.id);
	};
	const openAdd = (
		at: string,
		arrival: string | null,
		departure: string | null,
	) =>
		setForm({
			kind: "add",
			at,
			initial: {
				countryCode: "",
				arrival: arrival ?? "",
				departure: departure ?? "",
			},
		});
	const addForm = (at: string) =>
		form?.kind === "add" && form.at === at ? (
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
		edit({ stays: mergeKept(stays, legacyTripStays(trip, country)) });
		dropLegacy(trip);
	};

	const index = stays.findIndex((s) => s.id === selectedId);
	const selected = stays[index];
	const row = (i: number) => {
		const stay = stays[i] as TravelStay;
		return (
			<StayRow
				key={stay.id}
				stay={stay}
				number={i + 1}
				hints={hints[i] ?? []}
				birth={birth}
				today={today}
				selected={stay.id === selectedId}
				onSelect={() => select(stay.id === selectedId ? null : stay.id)}
				onChange={change}
				onDelete={() => {
					if (stay.id === selectedId) select(null);
					edit({ stays: stays.filter((s) => s.id !== stay.id) });
				}}
				onSplit={() => setForm({ kind: "split", id: stay.id })}
				onAddAfter={() =>
					openAdd(
						`after-${stay.id}`,
						stay.departure.date ?? today,
						stays[i + 1]?.arrival.date ?? null,
					)
				}
				below={
					form?.kind === "split" && form.id === stay.id ? (
						<SplitForm
							initial={middleDay(stay, birth, today)}
							valid={(date) => canSplitAt(stay, date)}
							onSplit={(date) => {
								edit({ stays: splitStay(stays, stay.id, date, evidenceDays) });
								setForm(null);
							}}
							onCancel={() => setForm(null)}
						/>
					) : (
						addForm(`after-${stay.id}`)
					)
				}
			/>
		);
	};
	const items = itemsOf(stays);
	if (order === "newest") items.reverse();

	if (!data) return error ? <p role="alert">{error}</p> : <p>Loading…</p>;

	return (
		<Stack>
			<div className="vp-stays-bar">
				<Toolbar>
					<Button
						size="sm"
						disabled={edits.past.length === 0}
						onClick={() => dispatch({ type: "undo" })}
					>
						← Undo
					</Button>
					<Button
						size="sm"
						disabled={edits.future.length === 0}
						onClick={() => dispatch({ type: "redo" })}
					>
						Redo →
					</Button>
					<Button
						size="sm"
						variant="primary"
						disabled={clear.length === 0}
						title="Approve stays with stamp or hand-set edges and no errors"
						onClick={() =>
							edit({
								stays: stays.map((s) =>
									clear.includes(s.id) ? { ...s, approved: true } : s,
								),
							})
						}
					>
						✓ Approve clear ({clear.length})
					</Button>
					<ToolbarSpacer />
					<span className="vp-trips-muted vp-stays-rebuild-note">
						Keeps approved and edited stays
					</span>
					<Button
						size="sm"
						variant="ghost"
						title="Suggest the history again from stamps and photos; approved and edited stays stay as they are"
						onClick={() => void rebuild()}
					>
						Rebuild suggestions
					</Button>
				</Toolbar>
			</div>
			{error ? <p role="alert">{error}</p> : null}

			<BirthSetting value={{ birth, birthCountry }} onChange={setBirth} />

			<LegacyTrips
				trips={data.legacy}
				onAdd={addLegacy}
				onForget={dropLegacy}
			/>

			<StatGroup>
				<Stat label="Stays" value={stays.length} />
				<Stat label="Countries" value={countries.size} />
				<Stat label="Left to approve" value={counts.left} />
				<Stat label="With errors" value={counts.withErrors} />
				<Stat label="Approved" value={counts.approved} />
			</StatGroup>

			{stored ? null : stays.length > 0 ? (
				<Notice tone="info">
					Suggested from your reviewed stamps and photo locations. Your first
					change saves it.
				</Notice>
			) : (
				<Notice>
					No reviewed stamps or photo locations yet, so there is nothing to
					suggest. Review stamps, import your iPhone photo locations or add a
					stay by hand.
				</Notice>
			)}

			<div className="vp-trips-layout" data-open={selected ? true : undefined}>
				<div className="vp-stays">
					<div className="vp-stays-listbar">
						<Button
							size="sm"
							variant="secondary"
							onClick={() =>
								openAdd(
									"top",
									latest ? (latest.departure.date ?? today) : today,
									null,
								)
							}
						>
							+ Add stay
						</Button>
						<ToolbarSpacer />
						<OrderToggle order={order} onChange={changeOrder} />
					</div>
					{addForm("top")}
					{items.map((item) =>
						item.kind === "stay" ? (
							row(item.index)
						) : (
							<GapRow
								key={`gap-${item.after}`}
								gap={item.gap}
								onAdd={() =>
									openAdd(
										`gap-${stays[item.after]?.id}`,
										item.gap.from,
										item.gap.to,
									)
								}
								below={addForm(`gap-${stays[item.after]?.id}`)}
							/>
						),
					)}
				</div>
				<div className="vp-trips-pane">
					{selected ? (
						<StayDetail
							key={selected.id}
							stay={selected}
							previous={stays[index - 1]}
							next={stays[index + 1]}
							birth={birth}
							today={today}
							photoDays={photoDays}
							usable={usable}
							stamps={data.stamps}
							onChange={change}
						/>
					) : stays.length > 0 ? (
						<p className="vp-trips-empty">
							Pick a stay to see its days, edges and stamps.
						</p>
					) : null}
				</div>
			</div>
		</Stack>
	);
}
