import { sortStays } from "./build";
import type { StayEdge, TravelStay } from "./types";

const manual = (date: string | null): StayEdge => ({
	date,
	source: "manual",
	method: "unknown",
});

/** An id not used by any of `stays`: `base`, else `base-2`, `base-3`… */
function freeId(stays: readonly TravelStay[], base: string): string {
	const used = new Set(stays.map((s) => s.id));
	let id = base;
	for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
	return id;
}

/**
 * The history matched to the birth setting. With both the birth country and
 * date, it begins with a stay there "since birth" up to the first stay's
 * arrival, unless some stay is since birth already. The stay added for it
 * (`sinceBirth`) follows the setting while the user has not edited it: a new
 * country moves it, it ends on the next stay's arrival, an incomplete setting
 * removes it. An edited one is the
 * user's and stays as it is.
 */
export function withBirthStay(
	stays: readonly TravelStay[],
	birth: { birthCountry: string | null; birth: string | null },
): TravelStay[] {
	const { birthCountry } = birth;
	const first = stays[0];
	const generated = first?.sinceBirth && !first.edited ? first : null;
	if (!birthCountry || !birth.birth)
		return generated ? stays.slice(1) : [...stays];
	if (generated) {
		const departure = {
			...generated.departure,
			date: stays[1]?.arrival.date ?? null,
		};
		return [
			{ ...generated, countryCode: birthCountry, departure },
			...stays.slice(1),
		];
	}
	if (first?.arrival.date === null) return [...stays];
	return [
		{
			id: freeId(stays, `stay-birth-${birthCountry.toLowerCase()}`),
			countryCode: birthCountry,
			place: "",
			kind: "stay",
			arrival: { date: null, source: "estimated", method: "unknown" },
			departure: {
				date: first?.arrival.date ?? null,
				source: "estimated",
				method: "unknown",
			},
			stampIds: [],
			photoIds: [],
			approved: false,
			sinceBirth: true,
		},
		...stays,
	];
}

/** Days of the evidence behind stays, to split it: stamp and photo id → YYYY-MM-DD. */
export interface EvidenceDays {
	stamps: ReadonlyMap<string, string>;
	photos: ReadonlyMap<string, string>;
}

/**
 * Whether `date` can split the stay: after its first day and before its last
 * (an open end counts as any day).
 */
export function canSplitAt(stay: TravelStay, date: string): boolean {
	const { arrival, departure } = stay;
	return (
		(arrival.date === null || arrival.date < date) &&
		(departure.date === null || date < departure.date)
	);
}

/**
 * The stay in `stays` with id `id` cut at `date` into two stays of its
 * country that share that day: the first keeps the arrival, the second the
 * departure. Stamps and photos go to the part their day falls in (a stamp on
 * the shared day stays with the first, unless it dated the departure; a
 * photo on it goes to the second). Both are edited and not approved.
 * Unchanged when the date does not lie inside the stay.
 */
export function splitStay(
	stays: readonly TravelStay[],
	id: string,
	date: string,
	days: EvidenceDays,
): TravelStay[] {
	const stay = stays.find((s) => s.id === id);
	if (!stay || !canSplitAt(stay, date)) return [...stays];
	const early =
		(map: ReadonlyMap<string, string>, before: (d: string) => boolean) =>
		(eid: string) => {
			const d = map.get(eid);
			return d === undefined || before(d);
		};
	const stampFirst = early(days.stamps, (d) => d <= date);
	const photoFirst = early(days.photos, (d) => d < date);
	const isFirstStamp = (sid: string) =>
		sid !== stay.departure.stampId && stampFirst(sid);
	const first: TravelStay = {
		...stay,
		departure: manual(date),
		stampIds: stay.stampIds.filter(isFirstStamp),
		photoIds: stay.photoIds.filter(photoFirst),
		approved: false,
		edited: true,
	};
	const second: TravelStay = {
		...stay,
		id: freeId(stays, `${stay.id}-${date}`),
		arrival: manual(date),
		stampIds: stay.stampIds.filter((sid) => !isFirstStamp(sid)),
		photoIds: stay.photoIds.filter((pid) => !photoFirst(pid)),
		approved: false,
		edited: true,
	};
	return stays.flatMap((s) => (s.id === id ? [first, second] : [s]));
}

/** What the user types to add a stay. */
export interface NewStay {
	countryCode: string;
	/** YYYY-MM-DD; null only for "since birth" or "still there". */
	arrival: string | null;
	departure: string | null;
}

/**
 * The history with a stay the user added, both edges set by hand, in date
 * order. Returns the list and the new stay's id.
 */
export function addStay(
	stays: readonly TravelStay[],
	add: NewStay,
): { stays: TravelStay[]; id: string } {
	const id = freeId(
		stays,
		`stay-${add.arrival ?? "birth"}-${add.countryCode.toLowerCase()}-added`,
	);
	const stay: TravelStay = {
		id,
		countryCode: add.countryCode,
		place: "",
		kind: "stay",
		arrival: manual(add.arrival),
		departure: manual(add.departure),
		stampIds: [],
		photoIds: [],
		approved: false,
		edited: true,
	};
	return { stays: sortStays([...stays, stay]), id };
}
