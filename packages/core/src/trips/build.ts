import { day } from "../explore/dates";
import type { LocationRow } from "../locations/types";
import type { BorderCrossing } from "../stamps/types";
import { type DatedStamp, locationDay } from "./evidence";
import type { EdgeSource, StayEdge, TravelMethod, TravelStay } from "./types";

/** What stays are suggested from. `home` fills the time between trips. */
export interface StayEvidence {
	stamps: readonly DatedStamp[];
	locations: readonly LocationRow[];
	home: string;
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
	/** Home assumed after an exit from abroad, without evidence of its own. */
	assumed?: boolean;
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
 * The passport backbone: home since birth, then a stay per crossing. After an
 * exit from abroad the traveller is assumed home again; after an exit from
 * home the place is unknown until the next arrival (`null` in the list).
 */
function backbone(
	stamps: readonly DatedStamp[],
	home: string,
): (Draft | null)[] {
	const list: (Draft | null)[] = [];
	let current: Draft | null = draft(home, edge(null, "estimated"));
	list.push(current);
	const enter = (countryCode: string, arrival: StayEdge): Draft => {
		const assumed: Draft | null = current;
		// Entering another country within a day of leaving one is the same
		// journey, not a stop at home: the time between is left to the photos.
		if (
			assumed?.assumed &&
			assumed.stampIds.length === 0 &&
			countryCode !== home &&
			arrival.date !== null &&
			assumed.arrival.date !== null &&
			day(arrival.date) - day(assumed.arrival.date) <= 1
		) {
			list[list.length - 1] = null;
			current = null;
		}
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
					// Since birth stays since birth; an estimate gives way to the stamp.
					if (stay.arrival.date !== null) stay.arrival = stampEdge(s);
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
				if (s.countryCode === home) {
					current = null;
					list.push(null);
				} else {
					current = { ...draft(home, edge(date, "estimated")), assumed: true };
					list.push(current);
				}
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

/** A backbone stay, or the unknown time between leaving home and the next arrival. */
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

/**
 * Photos per slot. A border day lies in two slots; its photo goes to the one
 * in the photo's country, else to the later one.
 */
function assign(all: readonly Slot[], photos: readonly Photo[]): Photo[][] {
	const buckets = all.map((): Photo[] => []);
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
		const index = same.at(-1) ?? matches.at(-1);
		if (index !== undefined) buckets[index]?.push(p);
	}
	return buckets;
}

/**
 * Photos split a slot into stays wherever their country changes; a change is
 * dated by the first photo in the next country. A day's photos are taken
 * country by country, the current one first, so a border day switches once.
 */
function split(
	slot: Slot,
	photos: readonly Photo[],
	stamps: ReadonlyMap<string, DatedStamp>,
): Draft[] {
	const original = slot.stay;
	if (photos.length === 0) return original ? [original] : [];
	const first = photos[0] as Photo;
	let segment: Draft = original
		? { ...draft(original.countryCode, original.arrival), posts: [] }
		: draft(first.countryCode, edge(slot.from, "estimated"));
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
		segment.departure = slot.to === null ? null : edge(slot.to, "estimated");
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

/** Neighbouring stays in one country (a stamp and photos told the same story) become one. */
function mergeSameCountry(list: readonly Draft[]): Draft[] {
	const out: Draft[] = [];
	for (const s of list) {
		const last = out.at(-1);
		if (last && last.countryCode === s.countryCode) {
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
 * The whole history as one-country stays, from reviewed stamps and photo
 * locations: the passport gives the backbone, photos subdivide it and fill
 * the time after leaving home, home fills the time between trips. The first
 * stay is home since birth; the last one stays open while nothing ends it.
 * A same-day stay entered and left by plane is suggested as a transit.
 */
export function suggestStays(evidence: StayEvidence): TravelStay[] {
	const { home } = evidence;
	const stamps = new Map(evidence.stamps.map((s) => [s.id, s]));
	const all = slots(backbone(evidence.stamps, home));
	const buckets = assign(all, photosOf(evidence.locations));
	const drafts = all
		.flatMap((slot, i) => split(slot, buckets[i] ?? [], stamps))
		.filter((s) => !isEmpty(s));
	const stays = withIds(
		mergeSameCountry(drafts).map((s) => {
			const departure = s.departure ?? edge(null, "estimated");
			const transit =
				s.countryCode !== home &&
				sameDay(s) &&
				s.arrival.method === "plane" &&
				departure.method === "plane";
			return {
				countryCode: s.countryCode,
				place: (s.cities.length > 0 ? s.cities : s.posts).join(", "),
				kind: transit ? "transit" : "stay",
				arrival: { ...s.arrival },
				departure: { ...departure },
				stampIds: s.stampIds,
				photoIds: s.photoIds,
				approved: false,
			};
		}),
	);
	inferMethods(stays);
	return stays;
}

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
	let list = [...suggested];
	for (const k of kept) {
		const from = fromOf(k);
		const to = toOf(k);
		list = list.flatMap((s): TravelStay[] => {
			const a = fromOf(s);
			const d = toOf(s);
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
	const keptIds = new Set(kept.map((k) => k.id));
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
