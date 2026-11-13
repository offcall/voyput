import { useNavigate, useParams } from "@tanstack/react-router";
import {
	COUNTRY_CODES,
	clearStayIds,
	deriveTrips,
	isIsoDate,
	spanLength,
	stayCounts,
	stayHints,
	type TravelStay,
	type Trip,
	usableStamps,
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
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useDb } from "../../db/DbContext";
import { DateField } from "./DateField";
import { EMPTY_EDITS, editReducer, type Snapshot } from "./editHistory";
import { countryName, localToday, plural, stayRange } from "./format";
import { buildPhotoDays } from "./photoDays";
import { StayDetail } from "./StayDetail";
import { StayRow } from "./StayRow";
import "./trips.css";
import {
	historyOf,
	homeFor,
	loadTripsData,
	saveBirth,
	saveHome,
	saveStays,
	suggestHistory,
	type TripsData,
} from "./tripStore";

/** The list in order: home stays alone, the stays of a trip together. */
type Part =
	| { kind: "stay"; index: number }
	| { kind: "trip"; trip: Trip; number: number; indexes: number[] };

function parts(stays: readonly TravelStay[], trips: readonly Trip[]): Part[] {
	const tripOf = new Map<string, Trip>();
	for (const trip of trips) for (const id of trip.stayIds) tripOf.set(id, trip);
	const out: Part[] = [];
	stays.forEach((stay, index) => {
		const trip = tripOf.get(stay.id);
		const last = out.at(-1);
		if (!trip) out.push({ kind: "stay", index });
		else if (last?.kind === "trip" && last.trip === trip)
			last.indexes.push(index);
		else
			out.push({
				kind: "trip",
				trip,
				number: trips.indexOf(trip) + 1,
				indexes: [index],
			});
	});
	return out;
}

function HomeSetting({
	home,
	picked,
	onPick,
}: {
	home: string | null;
	picked: boolean;
	onPick: (cc: string) => void;
}) {
	const [open, setOpen] = useState(false);
	if (!open && home)
		return (
			<p className="vp-stays-home">
				Home: <strong>{countryName(home)}</strong>
				{picked ? null : <span className="vp-trips-muted"> (most stays)</span>}{" "}
				·{" "}
				<button
					type="button"
					className="vp-stays-link"
					onClick={() => setOpen(true)}
				>
					change
				</button>
			</p>
		);
	return (
		<label className="vp-field vp-stays-home-pick">
			<span className="vp-field-label">Home country</span>
			<select
				className="vp-input"
				value={home ?? ""}
				onChange={(e) => {
					onPick(e.target.value);
					setOpen(false);
				}}
			>
				{home ? null : <option value="">Choose your home country</option>}
				{COUNTRY_CODES.map((cc) => (
					<option key={cc} value={cc}>
						{countryName(cc)} ({cc})
					</option>
				))}
			</select>
		</label>
	);
}

export function TripsPage() {
	const db = useDb();
	const [data, setData] = useState<TripsData | null>(null);
	const [stored, setStored] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [edits, dispatch] = useReducer(editReducer, EMPTY_EDITS);
	const { stays, birth } = edits;
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
				dispatch({
					type: "load",
					snapshot: { stays: historyOf(loaded), birth: loaded.birth },
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
		Promise.all([saveStays(db, stays), saveBirth(db, birth)])
			.then(() => setStored(true))
			.catch(fail);
	}, [db, version, stays, birth, fail]);

	const edit = (snapshot: Partial<Snapshot>) =>
		dispatch({ type: "edit", snapshot: { stays, birth, ...snapshot } });
	const change = (stay: TravelStay) =>
		edit({ stays: stays.map((s) => (s.id === stay.id ? stay : s)) });

	const today = localToday();
	const home = data ? homeFor(data, stays) : null;
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
	const trips = useMemo(() => deriveTrips(stays, home), [stays, home]);
	const photoDays = useMemo(
		() => buildPhotoDays(data?.locations ?? []),
		[data],
	);
	const visited = new Set(trips.flatMap((t) => t.visited));

	const pickHome = (cc: string) => {
		if (!data) return;
		const next = { ...data, pickedHome: cc };
		setData(next);
		saveHome(db, cc).catch(fail);
		// Nothing edited yet: suggest the history again for the new home.
		if (!stored)
			dispatch({
				type: "load",
				snapshot: { stays: suggestHistory(next), birth },
			});
	};
	const rebuild = () =>
		loadTripsData(db)
			.then((fresh) => {
				setData(fresh);
				edit({
					stays: suggestHistory(
						{ ...fresh, pickedHome: data?.pickedHome ?? fresh.pickedHome },
						stays.filter((s) => s.approved),
					),
				});
			})
			.catch(fail);

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
			/>
		);
	};

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
					<Button
						size="sm"
						variant="ghost"
						title="Suggest the history again from stamps and photos; approved stays stay"
						onClick={() => void rebuild()}
					>
						Rebuild suggestions
					</Button>
				</Toolbar>
			</div>
			{error ? <p role="alert">{error}</p> : null}

			<div className="vp-stays-settings">
				<HomeSetting
					home={home}
					picked={data.pickedHome !== null}
					onPick={pickHome}
				/>
				<div className="vp-stays-birth">
					<DateField
						label="Birth date"
						value={birth ?? ""}
						onChange={(value) => {
							if (value === "" || isIsoDate(value))
								edit({ birth: value === "" ? null : value });
						}}
					/>
					<span className="vp-trips-muted">
						Leave it empty to keep the first stay “since birth”.
					</span>
				</div>
			</div>

			<StatGroup>
				<Stat label="Trips" value={trips.length} />
				<Stat label="Countries visited" value={visited.size} />
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
					suggest. Review stamps, import your iPhone photo locations or choose
					your home country.
				</Notice>
			)}

			<div className="vp-trips-layout" data-open={selected ? true : undefined}>
				<div className="vp-stays">
					{parts(stays, trips).map((part) =>
						part.kind === "stay" ? (
							row(part.index)
						) : (
							<section
								key={part.trip.id}
								className="vp-stays-trip"
								data-approved={part.trip.approved || undefined}
								aria-label={`Trip ${part.number}: ${part.trip.title}`}
							>
								<h3 className="vp-stays-trip-head">
									<span>Trip {part.number}</span>
									<span className="vp-stays-trip-title">{part.trip.title}</span>
									<span className="vp-trips-muted">
										{stayRange(part.trip.start, part.trip.end)} ·{" "}
										{plural(
											spanLength({
												start: part.trip.start,
												end: part.trip.end,
											}) ?? 0,
											"day",
										)}
									</span>
								</h3>
								{part.indexes.map(row)}
							</section>
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
							home={home}
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
