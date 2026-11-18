/**
 * Frozen: do not edit. Copied from packages/core/src/trips/{build,evidence,
 * edit,history,legacy,countries,types}.ts, packages/core/src/explore/dates.ts,
 * packages/core/src/review/days.ts and packages/core/src/passports/photos.ts
 * and apps/web/src/db/db.ts; copied on 2026-11-18 (ADR 0039).
 *
 * Dexie version 3: stored trips become stays, placed in a history suggested
 * from the stamps and locations the way the app did on that date. Only
 * the logic this upgrade runs is here; core changes must not reach it.
 */
import type { Transaction } from "dexie";

// Stored shapes as this upgrade reads and writes them.

type Direction = "entry" | "exit" | "unknown";
type BorderCrossing = "car" | "plane" | "train" | "ship" | "foot" | "unknown";

interface Stamp {
	id: string;
	direction: Direction;
	borderCrossing: BorderCrossing;
	date: string | null;
	countryCode: string | null;
	location: string | null;
	problem: string | null;
	reviewed: boolean;
	dismissed?: { problem?: true };
}

interface LocationRow {
	date: string;
	countryCode: string;
	city: string;
	uuid: string;
}

type TravelMethod =
	| "walk"
	| "car"
	| "bus"
	| "train"
	| "plane"
	| "ship"
	| "unknown";

const TRAVEL_METHODS: readonly TravelMethod[] = [
	"walk",
	"car",
	"bus",
	"train",
	"plane",
	"ship",
	"unknown",
];

type EdgeSource = "stamp" | "photos" | "estimated" | "manual";

interface StayEdge {
	date: string | null;
	source: EdgeSource;
	method: TravelMethod;
	stampId?: string;
}

interface TravelStay {
	id: string;
	countryCode: string;
	place: string;
	kind: "stay" | "transit";
	arrival: StayEdge;
	departure: StayEdge;
	stampIds: string[];
	photoIds: string[];
	approved: boolean;
	edited?: boolean;
	evidenceChanged?: boolean;
	sinceBirth?: boolean;
}

interface LegacyBoundary {
	date: string;
	source: "manual" | "stamp" | "unknown";
	stampId?: string;
	method: string;
}

interface LegacyStop {
	id: string;
	day: string;
	countryCode: string;
	country: string;
	cities: string[];
	kind: "stay" | "transit";
}

/** A trip as stored before stays (Dexie version 2). */
interface LegacyTrip {
	id: string;
	title: string;
	start: string;
	end: string;
	confirmed: boolean;
	arrival: LegacyBoundary;
	departure: LegacyBoundary;
	stops: LegacyStop[];
	stampIds: string[];
}

interface KvRecord {
	key: string;
	value: unknown;
}

// review/days.ts, explore/dates.ts, passports/photos.ts

const MS_PER_DAY = 86_400_000;

const dayNumber = (iso: string): number | null => {
	const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(time) ? null : Math.floor(time / MS_PER_DAY);
};

const day = (iso: string): number => dayNumber(iso) ?? 0;

function isIsoDate(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// trips/evidence.ts

/** A stamp that can place the traveller in a country on a day. */
type DatedStamp = Stamp & { date: string; countryCode: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CC_RE = /^[A-Z]{2}$/;

/**
 * Reviewed stamps with a full date and a country, without an open problem.
 * A problem the user hid on Review no longer counts.
 */
function usableStamps(stamps: readonly Stamp[]): DatedStamp[] {
	return stamps
		.filter(
			(s): s is DatedStamp =>
				s.reviewed &&
				(s.problem === null || s.dismissed?.problem === true) &&
				s.date !== null &&
				DAY_RE.test(s.date) &&
				s.countryCode !== null &&
				CC_RE.test(s.countryCode),
		)
		.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Local calendar day of a photo. The CSV holds local time with an offset;
 * converting to UTC would move evening arrivals to the wrong day.
 */
function locationDay(row: LocationRow): string | null {
	const day = row.date.slice(0, 10);
	return DAY_RE.test(day) && CC_RE.test(row.countryCode) ? day : null;
}

function daysBetween(from: string, to: string): number {
	return (
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
		86_400_000
	);
}

// trips/build.ts

/** What stays are suggested from. */
interface StayEvidence {
	stamps: readonly DatedStamp[];
	locations: readonly LocationRow[];
}

const methodOf = (crossing: BorderCrossing): TravelMethod =>
	crossing === "foot" ? "walk" : crossing;

const edge = (
	date: string | null,
	source: EdgeSource,
	method: TravelMethod = "unknown",
): StayEdge => ({ date, source, method });

const stampEdge = (s: DatedStamp): StayEdge => ({
	date: s.date,
	source: "stamp",
	method: methodOf(s.borderCrossing),
	stampId: s.id,
});

/** A stay while it is built; `departure` null means not left yet. */
interface Draft {
	countryCode: string;
	arrival: StayEdge;
	departure: StayEdge | null;
	stampIds: string[];
	photoIds: string[];
	cities: string[];
	/** Border posts of the stamps; the place when no photo names a city. */
	posts: string[];
}

const draft = (countryCode: string, arrival: StayEdge): Draft => ({
	countryCode,
	arrival,
	departure: null,
	stampIds: [],
	photoIds: [],
	cities: [],
	posts: [],
});

const addTo = (list: string[], value: string | null) => {
	if (value && !list.includes(value)) list.push(value);
};

/**
 * A day's stamps in crossing order, which the passport does not record: the
 * current country's exit first, then exits from countries not entered that
 * day, then a country entered and left that day (an airport transit), then
 * entries, then the rest.
 */
function nextStamp(pending: DatedStamp[], current: string | null): DatedStamp {
	let index = pending.findIndex(
		(s) => s.direction === "exit" && s.countryCode === current,
	);
	// Leaving a country not entered today comes before arriving anywhere:
	// Schengen stamps the exit in another country than the entry.
	if (index < 0)
		index = pending.findIndex(
			(s) =>
				s.direction === "exit" &&
				!pending.some(
					(o) => o.direction === "entry" && o.countryCode === s.countryCode,
				),
		);
	if (index < 0)
		index = pending.findIndex(
			(s) =>
				s.direction === "entry" &&
				pending.some(
					(o) => o.direction === "exit" && o.countryCode === s.countryCode,
				),
		);
	if (index < 0) index = pending.findIndex((s) => s.direction === "entry");
	return pending.splice(Math.max(0, index), 1)[0] as DatedStamp;
}

/**
 * The passport backbone: a stay per crossing. Before the first stamp and
 * after each exit the place is unknown until the next arrival (`null` in the
 * list): photos may fill it, else it stays a gap.
 */
function backbone(stamps: readonly DatedStamp[]): (Draft | null)[] {
	const list: (Draft | null)[] = [null];
	let current = null as Draft | null;
	const enter = (countryCode: string, arrival: StayEdge): Draft => {
		if (current && !current.departure)
			current.departure = edge(arrival.date, "estimated");
		const next = draft(countryCode, arrival);
		list.push(next);
		current = next;
		return next;
	};
	const byDay = new Map<string, DatedStamp[]>();
	for (const s of stamps) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
	for (const [date, events] of [...byDay].sort((a, b) =>
		a[0].localeCompare(b[0]),
	)) {
		const pending = [...events];
		while (pending.length > 0) {
			const s = nextStamp(pending, current?.countryCode ?? null);
			const here: Draft | null = current;
			let stay: Draft;
			if (s.direction === "entry") {
				if (
					!here ||
					here.countryCode !== s.countryCode ||
					here.departure ||
					(here.arrival.source === "stamp" && here.arrival.date !== date)
				)
					stay = enter(s.countryCode, stampEdge(s));
				else {
					stay = here;
					// An estimate gives way to the stamp.
					stay.arrival = stampEdge(s);
				}
			} else if (s.direction === "exit") {
				stay =
					here && here.countryCode === s.countryCode
						? here
						: enter(s.countryCode, edge(date, "estimated"));
				stay.departure = stampEdge(s);
			} else {
				stay =
					here && here.countryCode === s.countryCode
						? here
						: enter(s.countryCode, edge(date, "estimated"));
			}
			stay.stampIds.push(s.id);
			addTo(stay.posts, s.location);
			if (s.direction === "exit") {
				current = null;
				list.push(null);
			}
		}
	}
	return list;
}

interface Photo {
	id: string;
	day: string;
	time: number;
	countryCode: string;
	city: string;
}

function photosOf(locations: readonly LocationRow[]): Photo[] {
	const photos: Photo[] = [];
	for (const row of locations) {
		const d = locationDay(row);
		if (!d) continue;
		const time = Date.parse(row.date);
		photos.push({
			id: row.uuid,
			day: d,
			time: Number.isNaN(time) ? 0 : time,
			countryCode: row.countryCode,
			city: row.city,
		});
	}
	return photos.sort((a, b) => a.day.localeCompare(b.day) || a.time - b.time);
}

/** A backbone stay, or the unknown time before the next arrival. */
interface Slot {
	stay: Draft | null;
	from: string | null;
	to: string | null;
}

/** Backbone stays and the gaps between them, in order, covering every day. */
function slots(list: readonly (Draft | null)[]): Slot[] {
	const out: Slot[] = [];
	list.forEach((stay, i) => {
		if (stay) {
			out.push({
				stay,
				from: stay.arrival.date,
				to: stay.departure?.date ?? null,
			});
			return;
		}
		const before = list[i - 1];
		const after = list[i + 1];
		out.push({
			stay: null,
			from: before?.departure?.date ?? null,
			to: after?.arrival.date ?? null,
		});
	});
	return out;
}

const inSlot = (slot: Slot, d: string) =>
	(slot.from === null || slot.from <= d) && (slot.to === null || d <= slot.to);

/** A stay entered by an entry stamp on `d`. */
const enteredOn = (slot: Slot | undefined, d: string) =>
	slot?.stay?.arrival.source === "stamp" && slot.stay.arrival.date === d;

/**
 * Photos per slot. A border day lies in two slots; its photo goes to the one
 * in the photo's country, else to the later one, unless that one is entered
 * by stamp that day and the photo was taken before the first photo in its
 * country (or there is none): then it was on the way there, so it goes to the
 * slot before (an airside transit on the day of the next entry stamp).
 */
function assign(all: readonly Slot[], photos: readonly Photo[]): Photo[][] {
	const buckets = all.map((): Photo[] => []);
	const firstTime = new Map<string, number>();
	for (const p of photos) {
		const key = `${p.day}|${p.countryCode}`;
		firstTime.set(key, Math.min(firstTime.get(key) ?? p.time, p.time));
	}
	const before = (slot: Slot | undefined, p: Photo) => {
		const own = firstTime.get(`${p.day}|${slot?.stay?.countryCode}`);
		return enteredOn(slot, p.day) && (own === undefined || p.time < own);
	};
	let first = 0;
	for (const p of photos) {
		while (first < all.length - 1 && !inSlot(all[first] as Slot, p.day)) {
			const to = (all[first] as Slot).to;
			if (to !== null && to < p.day) first++;
			else break;
		}
		const matches: number[] = [];
		for (let i = first; i < all.length; i++) {
			const slot = all[i] as Slot;
			if (slot.from !== null && slot.from > p.day) break;
			if (inSlot(slot, p.day)) matches.push(i);
		}
		const same = matches.filter(
			(i) => all[i]?.stay?.countryCode === p.countryCode,
		);
		let index = same.at(-1);
		if (index === undefined) {
			let at = matches.length - 1;
			while (at > 0 && before(all[matches[at] as number], p)) at--;
			index = matches[at];
		}
		if (index !== undefined) buckets[index]?.push(p);
	}
	return buckets;
}

/** Days between an edge of the unknown time and a photo that still count as the same crossing. */
const NEAR_DAYS = 1;

const near = (a: string, b: string) => Math.abs(day(a) - day(b)) <= NEAR_DAYS;

/**
 * Photos split a slot into stays wherever their country changes; a change is
 * dated by the first photo in the next country. A day's photos are taken
 * country by country, the current one first, so a border day switches once.
 * In the unknown time between stamps, photo stays begin at the first photo
 * and end at the last one (or at the slot's edge a day away): the rest is a gap.
 */
function split(
	slot: Slot,
	photos: readonly Photo[],
	stamps: ReadonlyMap<string, DatedStamp>,
): Draft[] {
	const original = slot.stay;
	if (photos.length === 0) return original ? [original] : [];
	const first = photos[0] as Photo;
	const last = photos.at(-1) as Photo;
	let segment: Draft = original
		? { ...draft(original.countryCode, original.arrival), posts: [] }
		: draft(
				first.countryCode,
				slot.from !== null && near(slot.from, first.day)
					? edge(slot.from, "estimated")
					: edge(first.day, "photos"),
			);
	const parts = [segment];
	const byDay = new Map<string, Photo[]>();
	for (const p of photos) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
	for (const [d, list] of byDay) {
		const order = [...new Set(list.map((p) => p.countryCode))];
		const open = segment.countryCode;
		const rank = (cc: string) => (cc === open ? -1 : order.indexOf(cc));
		const sorted = [...list].sort(
			(a, b) => rank(a.countryCode) - rank(b.countryCode) || a.time - b.time,
		);
		for (const p of sorted) {
			if (p.countryCode !== segment.countryCode) {
				segment.departure = edge(d, "photos");
				segment = draft(p.countryCode, edge(d, "photos"));
				parts.push(segment);
			}
			segment.photoIds.push(p.id);
			addTo(segment.cities, p.city);
		}
	}
	if (original) {
		// A departure stamp proves the traveller was back in that country.
		if (
			original.departure?.source === "stamp" &&
			segment.countryCode !== original.countryCode
		) {
			segment.departure = edge(original.departure.date, "estimated");
			segment = draft(
				original.countryCode,
				edge(original.departure.date, "estimated"),
			);
			parts.push(segment);
		}
		segment.departure = original.departure;
		for (const id of original.stampIds) {
			const s = stamps.get(id);
			if (!s) continue;
			const fits = parts.filter(
				(part) =>
					part.countryCode === s.countryCode &&
					(part.arrival.date === null || part.arrival.date <= s.date) &&
					(part.departure?.date == null || s.date <= part.departure.date),
			);
			const target =
				(s.direction === "entry" ? fits[0] : fits.at(-1)) ?? parts[0];
			target?.stampIds.push(id);
			if (target) addTo(target.posts, s.location);
		}
	} else {
		segment.departure =
			slot.to === null
				? null
				: near(slot.to, last.day)
					? edge(slot.to, "estimated")
					: edge(last.day, "photos");
	}
	return parts;
}

const sameDay = (s: Draft) =>
	s.arrival.date !== null && s.arrival.date === s.departure?.date;

/** A same-day stay without evidence is only the instant of a crossing. */
const isEmpty = (s: Draft) =>
	s.arrival.date !== null &&
	sameDay(s) &&
	s.stampIds.length === 0 &&
	s.photoIds.length === 0;

/**
 * Neighbouring stays in one country that touch or overlap (a stamp and
 * photos told the same story) become one. Across unknown days they stay two
 * visits with a gap between.
 */
function mergeSameCountry(list: readonly Draft[]): Draft[] {
	const out: Draft[] = [];
	for (const s of list) {
		const last = out.at(-1);
		const until = last ? (last.departure?.date ?? null) : null;
		const touches =
			until === null || s.arrival.date === null || s.arrival.date <= until;
		if (last && last.countryCode === s.countryCode && touches) {
			last.departure = s.departure;
			last.stampIds.push(...s.stampIds);
			last.photoIds.push(...s.photoIds);
			for (const c of s.cities) addTo(last.cities, c);
			for (const p of s.posts) addTo(last.posts, p);
		} else out.push({ ...s });
	}
	return out;
}

/**
 * A known method on one side of a crossing fills an unknown one on the other
 * side, when they are at most a day apart (the same journey).
 */
function inferMethods(stays: TravelStay[]): void {
	for (let i = 1; i < stays.length; i++) {
		const out = (stays[i - 1] as TravelStay).departure;
		const into = (stays[i] as TravelStay).arrival;
		if (out.date === null || into.date === null) continue;
		if (Math.abs(day(into.date) - day(out.date)) > 1) continue;
		if (out.method === "unknown") out.method = into.method;
		else if (into.method === "unknown") into.method = out.method;
	}
}

/** Unique, readable ids: `stay-<arrival>-<country>`. */
function withIds(list: readonly Omit<TravelStay, "id">[]): TravelStay[] {
	const used = new Set<string>();
	return list.map((s) => {
		const base = `stay-${s.arrival.date ?? "birth"}-${s.countryCode.toLowerCase()}`;
		let id = base;
		for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
		used.add(id);
		return { id, ...s };
	});
}

/**
 * The history as one-country stays, only where there is evidence: the
 * passport gives the backbone, photos subdivide it and fill the time between
 * stamps. Days without evidence are left as gaps; nothing is assumed about
 * them. The last stay stays open while nothing ends it. A stay entered and
 * left by plane the same day is suggested as a transit.
 */
function suggestStays(evidence: StayEvidence): TravelStay[] {
	const stamps = new Map(evidence.stamps.map((s) => [s.id, s]));
	const all = slots(backbone(evidence.stamps));
	const buckets = assign(all, photosOf(evidence.locations));
	const drafts = all
		.flatMap((slot, i) => split(slot, buckets[i] ?? [], stamps))
		.filter((s) => !isEmpty(s));
	const stays = withIds(
		mergeSameCountry(drafts).map(
			(s): Omit<TravelStay, "id"> => ({
				countryCode: s.countryCode,
				place: (s.cities.length > 0 ? s.cities : s.posts).join(", "),
				kind: "stay",
				arrival: { ...s.arrival },
				departure: { ...(s.departure ?? edge(null, "estimated")) },
				stampIds: s.stampIds,
				photoIds: s.photoIds,
				approved: false,
			}),
		),
	);
	inferMethods(stays);
	for (const s of stays) if (isTransit(s)) s.kind = "transit";
	return stays;
}

/**
 * Entered and left by plane on the same day (a method a neighbouring
 * crossing gave counts). An overnight stop may be a hotel night, so it stays
 * a stay for the user to mark.
 */
const isTransit = (s: TravelStay): boolean =>
	s.arrival.method === "plane" &&
	s.departure.method === "plane" &&
	s.arrival.date !== null &&
	s.arrival.date === s.departure.date;

const NEVER = "0000-00-00";
const ALWAYS = "9999-99-99";
const fromOf = (s: TravelStay) => s.arrival.date ?? NEVER;
const toOf = (s: TravelStay) => s.departure.date ?? ALWAYS;

const exact = (e: StayEdge) => e.source === "stamp" || e.source === "manual";

/**
 * Suggested stays around stays the user keeps (approved ones, or migrated
 * trips): a suggestion is cut back to a kept stay's edges or dropped when it
 * lies inside one. Sharing a border day is not an overlap. A cut-off rest in
 * the kept stay's own country is the same stay seen by estimate, so it goes,
 * and the stay beyond it moves up to the kept edge, unless a stamp or the
 * user dated that rest. Otherwise a neighbour moves up only across a border
 * day ({@link SNAP_DAYS}); a longer gap has no evidence and stays a gap. A
 * moved edge is an estimate: it keeps the kept edge's stamp only when it was
 * read from that same stamp.
 */
/** Days a suggested edge may move to meet a kept stay without other evidence. */
const SNAP_DAYS = 1;

/** `own` moved to the kept edge's date. */
const movedEdge = (own: StayEdge, kept: StayEdge): StayEdge => {
	if (own.stampId !== undefined && own.stampId === kept.stampId)
		return { ...kept };
	if (own.date === kept.date) return own;
	return { date: kept.date, source: "estimated", method: kept.method };
};

function mergeKept(
	suggested: readonly TravelStay[],
	kept: readonly TravelStay[],
): TravelStay[] {
	const keptIds = new Set(kept.map((k) => k.id));
	// A kept stay replaces the suggestion it came from.
	let list = suggested.filter((s) => !keptIds.has(s.id));
	// Days covered by dropped rests: a neighbour may move up across them.
	const dropped: Period[] = [];
	for (const k of kept) {
		const from = fromOf(k);
		const to = toOf(k);
		list = list.flatMap((s): TravelStay[] => {
			const a = fromOf(s);
			const d = toOf(s);
			// The same country within the kept days (a same-day transit too) is the kept stay.
			if (s.countryCode === k.countryCode && a >= from && d <= to) return [];
			if (!(a < to && d > from)) return [s];
			const same = s.countryCode === k.countryCode;
			const keepBefore = a < from && !(same && !exact(s.arrival));
			const keepAfter = d > to && !(same && !exact(s.departure));
			if (same && a < from && !keepBefore)
				dropped.push({ start: a, end: from });
			if (same && d > to && !keepAfter) dropped.push({ start: to, end: d });
			const before = keepBefore
				? [{ ...s, departure: movedEdge(s.departure, k.arrival) }]
				: [];
			const after = keepAfter
				? [
						{
							...s,
							id: `${s.id}-after`,
							arrival: movedEdge(s.arrival, k.departure),
						},
					]
				: [];
			return [...before, ...after];
		});
	}
	const out = sortStays([...list, ...kept]);
	// A border day apart, or a dropped rest between them: the edges meet.
	const bridged = (start: string | null, end: string | null) =>
		start !== null &&
		end !== null &&
		(daysBetween(start, end) <= SNAP_DAYS ||
			dropped.some((p) => p.start <= start && p.end >= end));
	return out.map((s, i) => {
		if (keptIds.has(s.id)) return s;
		const prev = out[i - 1];
		const next = out[i + 1];
		let stay = s;
		if (
			prev &&
			keptIds.has(prev.id) &&
			!exact(s.arrival) &&
			bridged(prev.departure.date, s.arrival.date)
		)
			stay = { ...stay, arrival: movedEdge(s.arrival, prev.departure) };
		if (
			next &&
			keptIds.has(next.id) &&
			!exact(s.departure) &&
			bridged(s.departure.date, next.arrival.date)
		)
			stay = { ...stay, departure: movedEdge(s.departure, next.arrival) };
		return stay;
	});
}

/** Stays by arrival ("since birth" first), then by departure ("still there" last). */
function sortStays(stays: readonly TravelStay[]): TravelStay[] {
	return [...stays].sort(
		(a, b) =>
			fromOf(a).localeCompare(fromOf(b)) || toOf(a).localeCompare(toOf(b)),
	);
}

/** A span of days, both ends included. */
interface Period {
	start: string;
	end: string;
}

const isPeriod = (v: unknown): v is Period =>
	typeof v === "object" &&
	v !== null &&
	"start" in v &&
	"end" in v &&
	typeof v.start === "string" &&
	isIsoDate(v.start) &&
	typeof v.end === "string" &&
	isIsoDate(v.end);

/** Periods read from storage; anything malformed is skipped. */
const periodsOf = (value: unknown): Period[] =>
	Array.isArray(value) ? value.filter(isPeriod) : [];

const joinInto = (into: TravelStay, next: TravelStay) => {
	into.departure = next.departure;
	into.stampIds = [...into.stampIds, ...next.stampIds];
	into.photoIds = [...into.photoIds, ...next.photoIds];
};

/**
 * Periods where the user deleted a trip (before stays): nothing was there.
 * A stay that begins inside such a period goes, unless a stamp or the user
 * dated that arrival and it lasts beyond the period; a one-day stay on the
 * period's first or last day is the border day the trip shared with the
 * time around it and stays. Stays of one country a dropped one separated join.
 */
function applyDismissed(
	stays: readonly TravelStay[],
	periods: readonly Period[],
): TravelStay[] {
	if (periods.length === 0) return [...stays];
	const inside = (s: TravelStay) => {
		const from = fromOf(s);
		const to = toOf(s);
		return periods.some(
			(p) =>
				p.start <= from &&
				from <= p.end &&
				(to <= p.end || !exact(s.arrival)) &&
				!(from === to && (from === p.start || from === p.end)),
		);
	};
	const out: TravelStay[] = [];
	let dropped = false;
	for (const stay of stays) {
		if (inside(stay)) {
			dropped = true;
			continue;
		}
		const last = out.at(-1);
		if (dropped && last && last.countryCode === stay.countryCode)
			joinInto(last, stay);
		else out.push({ ...stay });
		dropped = false;
	}
	return out;
}

// trips/countries.ts

/** ISO 3166-1 alpha-2 codes of all officially assigned countries and areas. */
const COUNTRY_CODES: readonly string[] = (
	"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI " +
	"BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN " +
	"CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK " +
	"FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM " +
	"HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN " +
	"KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK " +
	"ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP " +
	"NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
	"SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF " +
	"TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI " +
	"VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** Also accepts XK (Kosovo), which photo exports and stamps use. */
function isCountryCode(value: unknown): value is string {
	return (
		typeof value === "string" &&
		(value === "XK" || COUNTRY_CODES.includes(value))
	);
}

/** Names some engines lack: XK is user-assigned, so `Intl` may not know it. */
const FALLBACK_NAMES: Readonly<Record<string, string>> = { XK: "Kosovo" };

/** English name of a country code; the code itself only when nothing knows it. */
function countryNameOf(code: string): string {
	let name: string | undefined;
	try {
		name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
	} catch {
		name = undefined;
	}
	return name && name !== code ? name : (FALLBACK_NAMES[code] ?? code);
}

// trips/legacy.ts

const legacySource = (b: LegacyBoundary): EdgeSource =>
	b.source === "unknown" ? "estimated" : b.source;

const legacyMethod = (method: string): TravelMethod =>
	method === "foot"
		? "walk"
		: (TRAVEL_METHODS as readonly string[]).includes(method)
			? (method as TravelMethod)
			: "unknown";

const legacyEdge = (b: LegacyBoundary, date: string): StayEdge => ({
	date,
	source: legacySource(b),
	method: legacyMethod(b.method),
	...(b.stampId && b.source === "stamp" ? { stampId: b.stampId } : {}),
});

/**
 * A stored trip as stays: its stops grouped into runs of one country, the
 * trip's arrival and departure on the outer edges, photo days between them.
 * A confirmed trip gives approved stays. A trip without stops gives one
 * stay in `country` (see `legacyTripCountry`), or none without it.
 */
function legacyTripStays(
	trip: LegacyTrip,
	country: string | null = null,
): TravelStay[] {
	if (trip.stops.length === 0)
		return country
			? [
					{
						id: `${trip.id}-0`,
						countryCode: country,
						place: "",
						kind: "stay",
						arrival: legacyEdge(trip.arrival, trip.start),
						departure: legacyEdge(trip.departure, trip.end),
						stampIds: [...trip.stampIds],
						photoIds: [],
						approved: trip.confirmed,
					},
				]
			: [];
	const days = [...new Set(trip.stops.map((s) => s.day))].sort();
	const runs: {
		countryCode: string;
		first: string;
		last: string;
		stops: LegacyStop[];
	}[] = [];
	for (const d of days) {
		const open = runs.at(-1)?.countryCode;
		const today = trip.stops
			.filter((s) => s.day === d)
			.sort(
				(a, b) =>
					Number(b.countryCode === open) - Number(a.countryCode === open) ||
					a.countryCode.localeCompare(b.countryCode),
			);
		for (const stop of today) {
			const run = runs.at(-1);
			if (run && run.countryCode === stop.countryCode) {
				run.last = d;
				run.stops.push(stop);
			} else
				runs.push({
					countryCode: stop.countryCode,
					first: d,
					last: d,
					stops: [stop],
				});
		}
	}
	return runs.map((run, i) => {
		const next = runs[i + 1];
		const photos = (date: string): StayEdge => ({
			date,
			source: "photos",
			method: "unknown",
		});
		return {
			id: `${trip.id}-${i}`,
			countryCode: run.countryCode,
			place: [...new Set(run.stops.flatMap((s) => s.cities))].join(", "),
			kind: run.stops.every((s) => s.kind === "transit") ? "transit" : "stay",
			arrival:
				i === 0 ? legacyEdge(trip.arrival, trip.start) : photos(run.first),
			departure: next
				? photos(next.first)
				: legacyEdge(trip.departure, trip.end),
			stampIds: i === 0 ? [...trip.stampIds] : [],
			photoIds: [],
			approved: trip.confirmed,
		};
	});
}

/** The parts of a title like "Rome, Italy → France" that may name a country. */
const titleParts = (title: string) =>
	title
		.split(/→|->|,|\/|·| - /)
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);

/**
 * The country of a stored trip without stops: the first country its stamps
 * entered, else the last one they left (a trip began by leaving where the
 * traveller lived), else a country its title names. Null when none tells.
 */
function legacyTripCountry(
	trip: LegacyTrip,
	stamps: readonly Pick<Stamp, "id" | "countryCode" | "direction" | "date">[],
): string | null {
	const own = stamps
		.filter(
			(s) =>
				trip.stampIds.includes(s.id) &&
				s.countryCode !== null &&
				isCountryCode(s.countryCode),
		)
		.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
	const stamp =
		own.find((s) => s.direction === "entry") ??
		own.filter((s) => s.direction === "exit").at(-1) ??
		own[0];
	if (stamp?.countryCode) return stamp.countryCode;
	for (const part of titleParts(trip.title)) {
		const code = part.toUpperCase();
		if (code.length === 2 && isCountryCode(code)) return code;
		const named = COUNTRY_CODES.find(
			(cc) => countryNameOf(cc).toLowerCase() === part,
		);
		if (named) return named;
	}
	return null;
}

// trips/edit.ts `withBirthStay` and trips/history.ts `suggestHistory`, as
// this upgrade called them: without a birth country or date.

/** The history without a generated, unedited stay since birth first. */
function withoutBirthStay(stays: readonly TravelStay[]): TravelStay[] {
	const first = stays[0];
	const generated = first?.sinceBirth && !first.edited ? first : null;
	return generated ? stays.slice(1) : [...stays];
}

/** The history suggested from the evidence, built around the stays in `kept`. */
function suggestHistory(
	source: {
		stamps: readonly Stamp[];
		locations: readonly LocationRow[];
		dismissed: readonly Period[];
	},
	kept: readonly TravelStay[],
): TravelStay[] {
	const suggested = applyDismissed(
		suggestStays({
			stamps: usableStamps(source.stamps),
			locations: source.locations,
		}),
		source.dismissed,
	);
	return withoutBirthStay(mergeKept(suggested, kept));
}

// db/db.ts

/** `kv` key of stored trips the migration could not place in a country. */
export const LEGACY_TRIPS_KEY = "trips:legacy";

/**
 * Stored trips become stays, put into a history suggested from the stamps
 * and locations, so a user's edits survive. A trip without stops goes to the
 * country its stamps or title name; one that names none is kept in `kv`
 * (`trips:legacy`) for the user to place on the Trips step. Without trips
 * nothing is stored: the Trips step suggests the history on its own.
 */
export async function migrateTrips(tx: Transaction): Promise<void> {
	const trips = await tx.table<LegacyTrip, string>("trips").toArray();
	if (trips.length === 0) return;
	const [stamps, locations, dismissed] = await Promise.all([
		tx.table<Stamp, string>("stamps").toArray(),
		tx.table<LocationRow, string>("locations").toArray(),
		tx.table<KvRecord, string>("kv").get("trips:dismissed"),
	]);
	const kept: TravelStay[] = [];
	const unplaced: LegacyTrip[] = [];
	for (const trip of trips) {
		const stays = legacyTripStays(trip, legacyTripCountry(trip, stamps));
		if (stays.length > 0) kept.push(...stays);
		else unplaced.push(trip);
	}
	if (unplaced.length > 0)
		await tx
			.table<KvRecord, string>("kv")
			.put({ key: LEGACY_TRIPS_KEY, value: unplaced });
	if (kept.length === 0) return;
	// Deleted trips stay deleted: the Trips step reads the same periods.
	const history = suggestHistory(
		{ stamps, locations, dismissed: periodsOf(dismissed?.value) },
		kept,
	);
	await tx.table<TravelStay, string>("stays").bulkPut(history);
}
