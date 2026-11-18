/** Synthetic Apple Photos location export that matches the demo trips. */

import {
	type City,
	COUNTRIES,
	type Country,
	DOMESTIC,
	HOME,
	HOME_CITY,
	LOCATIONS_FROM,
	LOCATIONS_TO,
	type Move,
	QUIET,
	TRIPS,
} from "./scenario.ts";

/** The full 10-column header; the import also takes the export script's shorter one. */
const HEADER =
	"date,lat,lon,country_code,country,city,source,is_video,filename,uuid";

/** Deterministic PRNG (mulberry32), so the generated files never change by accident. */
export function random(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function* days(from: string, to: string): Generator<string> {
	const d = new Date(`${from}T00:00:00Z`);
	const end = new Date(`${to}T00:00:00Z`);
	while (d <= end) {
		yield d.toISOString().slice(0, 10);
		d.setUTCDate(d.getUTCDate() + 1);
	}
}

function country(code: string): Country {
	const found = COUNTRIES[code];
	if (!found) throw new Error(`Unknown country ${code}`);
	return found;
}

function city(code: string, name: string): City {
	const found = country(code).cities.find((c) => c.name === name);
	if (!found) throw new Error(`Unknown city ${name} in ${code}`);
	return found;
}

const MOVES: Move[] = [...TRIPS.flatMap((t) => t.moves), ...DOMESTIC].sort(
	(a, b) => a.at.localeCompare(b.at),
);
for (const move of MOVES) if (move.country) city(move.country, move.city);

const HOME_MOVE: Move = { at: "", country: HOME, city: HOME_CITY };

/** Where the traveller is at a local time "YYYY-MM-DD HH:MM". */
function placeAt(at: string): Move {
	let place = HOME_MOVE;
	for (const move of MOVES) {
		if (move.at > at) break;
		place = move;
	}
	return place;
}

/** Days of trips marked long: photos as sparse as at home. */
const LONG_DAYS = new Set(
	TRIPS.filter((t) => t.long).flatMap((t) => [
		...days(
			t.moves[0]?.at.slice(0, 10) ?? "",
			t.moves.at(-1)?.at.slice(0, 10) ?? "",
		),
	]),
);

/**
 * Days that must have a photo at home: the eve of the first trip (so the
 * history before the first stamp runs up to it) and the day the planted
 * misread date lands on.
 */
const PHOTO_DAYS = new Set(["2016-08-09", "2019-09-16"]);

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const clock = (minute: number) =>
	`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

/** Last Sunday of a month (1-based), as YYYY-MM-DD. */
function lastSunday(year: number, month: number): string {
	const d = new Date(Date.UTC(year, month, 0));
	d.setUTCDate(d.getUTCDate() - d.getUTCDay());
	return d.toISOString().slice(0, 10);
}

/** UTC offset like "+03:00" on a day, with EU summer time where it applies. */
function offset(c: Country, day: string): string {
	const year = Number(day.slice(0, 4));
	const summer =
		c.dst && day >= lastSunday(year, 3) && day < lastSunday(year, 10);
	const hours = c.utc + (summer ? 1 : 0);
	return `${hours < 0 ? "-" : "+"}${pad(Math.abs(hours))}:00`;
}

/** A day's places: each with the minutes it covers within the photo window. */
function segments(day: string): { move: Move; from: number; to: number }[] {
	const START = 7 * 60;
	const END = 24 * 60 - 1;
	const today = MOVES.filter((move) => move.at.startsWith(day));
	const list = [{ move: placeAt(`${day} 00:00`), from: 0 }];
	for (const move of today) {
		const [h = 0, min = 0] = move.at.slice(11).split(":").map(Number);
		list.push({ move, from: h * 60 + min });
	}
	return list
		.map((seg, i) => ({
			move: seg.move,
			from: Math.max(START, seg.from),
			to: Math.min(END, (list[i + 1]?.from ?? END + 1) - 1),
		}))
		.filter(
			(seg) =>
				seg.move.country !== "" &&
				!city(seg.move.country, seg.move.city).post &&
				seg.to - seg.from >= 20,
		);
}

export interface PhotoRow {
	day: string;
	countryCode: string;
	filename: string;
	uuid: string;
}

export function locationsCsv(): { csv: string; rows: PhotoRow[] } {
	const rand = random(20161);
	const lines = [HEADER];
	const rows: PhotoRow[] = [];
	let number = 412;
	const hex = (n: number) =>
		Array.from({ length: n }, () =>
			Math.floor(rand() * 16)
				.toString(16)
				.toUpperCase(),
		).join("");
	for (const day of days(LOCATIONS_FROM, LOCATIONS_TO)) {
		const segs = segments(day);
		const abroad = segs.some((seg) => seg.move.country !== HOME);
		const away = segs.some((seg) => seg.move.city !== HOME_CITY);
		const moving = MOVES.some((move) => move.at.startsWith(day));
		const quiet = day >= QUIET.from && day <= QUIET.to;
		const count = LONG_DAYS.has(day)
			? moving
				? 3 + Math.floor(rand() * 5)
				: rand() < 0.3
					? 0
					: 1 + Math.floor(rand() * 5)
			: abroad
				? 5 + Math.floor(rand() * 9)
				: away || moving
					? 3 + Math.floor(rand() * 7)
					: rand() < (quiet ? 0.85 : 0.6)
						? 0
						: 1 + Math.floor(rand() * 3);
		const window = segs.reduce((sum, seg) => sum + seg.to - seg.from + 1, 0);
		const minutes: number[] = [];
		const at = (from: number, to: number) =>
			from + Math.floor(rand() * (to - from + 1));
		for (let i = 0; i < count; i++) {
			// Spread over the day's places by time, so each gets its share.
			let left = Math.floor(rand() * window);
			for (const seg of segs) {
				const span = seg.to - seg.from + 1;
				if (left < span) {
					minutes.push(seg.from + left);
					break;
				}
				left -= span;
			}
		}
		// A transit, or a new country entered today, always shows in the photos.
		segs.forEach((seg, i) => {
			const transit =
				seg.move.at.startsWith(day) &&
				city(seg.move.country, seg.move.city).transit;
			const crossed = i > 0 && segs[i - 1]?.move.country !== seg.move.country;
			const has = minutes.some((t) => t >= seg.from && t <= seg.to);
			const extra = transit ? 2 + Math.floor(rand() * 3) : crossed && !has;
			for (let n = Number(extra); n > 0; n--)
				minutes.push(at(seg.from, seg.to));
		});
		if (minutes.length === 0 && PHOTO_DAYS.has(day))
			minutes.push(at(10 * 60, 20 * 60));
		minutes.sort((a, b) => a - b);

		for (const minute of minutes) {
			const place = placeAt(`${day} ${clock(minute)}`);
			const c = country(place.country);
			const spot = city(place.country, place.city);
			const spread = spot.spread ?? 0.03;
			const video = rand() < 0.06;
			const ext = video ? "MOV" : day < "2017-09-20" ? "JPG" : "HEIC";
			const filename = `IMG_${pad(number, 4)}.${ext}`;
			number = number === 9999 ? 1 : number + 1;
			const uuid = `demo-${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
			lines.push(
				[
					`${day}T${clock(minute)}:${pad(Math.floor(rand() * 60))}${offset(c, day)}`,
					(spot.lat + (rand() - 0.5) * 2 * spread).toFixed(6),
					(spot.lon + (rand() - 0.5) * 2 * spread).toFixed(6),
					c.code,
					c.name,
					spot.name,
					rand() < 0.04 ? "offline" : "apple",
					video ? "True" : "False",
					filename,
					uuid,
				].join(","),
			);
			rows.push({ day, countryCode: c.code, filename, uuid });
		}
	}
	return { csv: `${lines.join("\n")}\n`, rows };
}
