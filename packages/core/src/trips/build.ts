import { day } from "../explore/dates";
import type { LocationRow } from "../locations/types";
import { isIsoDate } from "../passports/photos";
import type { BorderCrossing } from "../stamps/types";
import { type DatedStamp, locationDay } from "./evidence";
import type { EdgeSource, StayEdge, TravelMethod, TravelStay } from "./types";

/** What stays are suggested from. */
export interface StayEvidence {
	stamps: readonly DatedStamp[];
	locations: readonly LocationRow[];
}

export const methodOf = (crossing: BorderCrossing): TravelMethod =>
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
export function suggestStays(evidence: StayEvidence): TravelStay[] {
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
 * user dated that rest.
 */
export function mergeKept(
	suggested: readonly TravelStay[],
	kept: readonly TravelStay[],
): TravelStay[] {
	const keptIds = new Set(kept.map((k) => k.id));
	// A kept stay replaces the suggestion it came from.
	let list = suggested.filter((s) => !keptIds.has(s.id));
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
			const before =
				a < from && !(same && !exact(s.arrival))
					? [{ ...s, departure: { ...k.arrival } }]
					: [];
			const after =
				d > to && !(same && !exact(s.departure))
					? [{ ...s, id: `${s.id}-after`, arrival: { ...k.departure } }]
					: [];
			return [...before, ...after];
		});
	}
	const out = sortStays([...list, ...kept]);
	// Close what a dropped rest left open: the neighbours meet the kept edges.
	return out.map((s, i) => {
		if (keptIds.has(s.id)) return s;
		const prev = out[i - 1];
		const next = out[i + 1];
		let stay = s;
		if (prev && keptIds.has(prev.id) && !exact(s.arrival))
			stay = { ...stay, arrival: { ...prev.departure } };
		if (next && keptIds.has(next.id) && !exact(s.departure))
			stay = { ...stay, departure: { ...next.arrival } };
		return stay;
	});
}

/** Stays by arrival ("since birth" first), then by departure ("still there" last). */
export function sortStays(stays: readonly TravelStay[]): TravelStay[] {
	return [...stays].sort(
		(a, b) =>
			fromOf(a).localeCompare(fromOf(b)) || toOf(a).localeCompare(toOf(b)),
	);
}

/** A span of days, both ends included. */
export interface Period {
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
export const periodsOf = (value: unknown): Period[] =>
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
export function applyDismissed(
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

/** An edge read from a removed stamp becomes an estimate on the same day. */
function withoutStamp(e: StayEdge, removed: (id: string) => boolean): StayEdge {
	if (!e.stampId || !removed(e.stampId)) return e;
	const { stampId: _, ...rest } = e;
	return { ...rest, source: "estimated" };
}

/** Evidence the user deleted or changed after stays were built from it. */
export interface EvidenceChange {
	removedStamps?: ReadonlySet<string>;
	/** Stamps whose date, country, direction or crossing changed. */
	changedStamps?: ReadonlySet<string>;
	/** Photo locations (`LocationRow.uuid`). */
	removedPhotos?: ReadonlySet<string>;
	/** Photo locations whose day or country changed (a replacing CSV). */
	changedPhotos?: ReadonlySet<string>;
}

/**
 * Stays after the user deleted or edited their evidence. Ids of deleted
 * stamps and photos go, and an edge read from a deleted stamp becomes an
 * estimate on the same day. A stay that lost evidence or holds a changed
 * stamp or photo is marked `evidenceChanged`. No stay is deleted, moved or
 * unapproved: the user re-suggests it or keeps it as is. Untouched stays are
 * returned as they were.
 */
export function flagChangedEvidence(
	stays: readonly TravelStay[],
	change: EvidenceChange,
): TravelStay[] {
	const none = new Set<string>();
	const { removedStamps = none, changedStamps = none } = change;
	const removedPhotos = change.removedPhotos ?? none;
	const changedPhotos = change.changedPhotos ?? none;
	const gone = (id: string) => removedStamps.has(id);
	return stays.map((stay) => {
		const stampIds = stay.stampIds.filter((id) => !gone(id));
		const photoIds = stay.photoIds.filter((id) => !removedPhotos.has(id));
		const arrival = withoutStamp(stay.arrival, gone);
		const departure = withoutStamp(stay.departure, gone);
		const changed =
			stampIds.length < stay.stampIds.length ||
			photoIds.length < stay.photoIds.length ||
			arrival !== stay.arrival ||
			departure !== stay.departure ||
			[...stay.stampIds, stay.arrival.stampId, stay.departure.stampId].some(
				(id) => id !== undefined && changedStamps.has(id),
			) ||
			photoIds.some((id) => changedPhotos.has(id));
		if (!changed) return stay;
		return {
			...stay,
			stampIds,
			photoIds,
			arrival,
			departure,
			evidenceChanged: true,
		};
	});
}

/**
 * The history with the stay `id` replaced by what `suggested` holds for its
 * days; every other stay stays as it is. Suggestions are cut back to the
 * other stays (`mergeKept`) and to the stay's own first and last day, so
 * nothing outside it moves. With no evidence left there, the stay just goes.
 */
export function replaceBySuggestion(
	stays: readonly TravelStay[],
	id: string,
	suggested: readonly TravelStay[],
): TravelStay[] {
	const target = stays.find((s) => s.id === id);
	if (!target) return [...stays];
	const others = stays.filter((s) => s.id !== id);
	const used = new Set(others.map((s) => s.id));
	const from = fromOf(target);
	const to = toOf(target);
	const fresh = mergeKept(suggested, others).flatMap((s): TravelStay[] => {
		if (used.has(s.id)) return [];
		const a = fromOf(s);
		const d = toOf(s);
		if (!((a < to && d > from) || (a >= from && d <= to))) return [];
		let freeId = s.id;
		for (let n = 2; used.has(freeId); n++) freeId = `${s.id}-${n}`;
		used.add(freeId);
		return [
			{
				...s,
				id: freeId,
				arrival: a < from ? { ...target.arrival } : s.arrival,
				departure: d > to ? { ...target.departure } : s.departure,
			},
		];
	});
	return sortStays([...others, ...fresh]);
}

/**
 * The history without some evidence (removed demo data): a stay whose
 * stamps and photos were all removed goes; others keep their own evidence,
 * dates, edits and approval, and an edge read from a removed stamp becomes
 * an estimate. The days a removed stay covered are left as a gap.
 */
export function withoutEvidence(
	stays: readonly TravelStay[],
	removed: { stamp: (id: string) => boolean; photo: (id: string) => boolean },
): TravelStay[] {
	const unstamped = (e: StayEdge) => withoutStamp(e, removed.stamp);
	return stays.flatMap((stay): TravelStay[] => {
		const stampIds = stay.stampIds.filter((id) => !removed.stamp(id));
		const photoIds = stay.photoIds.filter((id) => !removed.photo(id));
		const had = stay.stampIds.length + stay.photoIds.length;
		if (had > 0 && stampIds.length + photoIds.length === 0) return [];
		return [
			{
				...stay,
				stampIds,
				photoIds,
				arrival: unstamped(stay.arrival),
				departure: unstamped(stay.departure),
			},
		];
	});
}
