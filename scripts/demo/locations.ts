/** Synthetic Apple Photos location export that matches the demo trips. */

import {
	COUNTRIES,
	type Country,
	HOME,
	LOCATIONS_FROM,
	LOCATIONS_TO,
	TRIPS,
} from "./scenario.ts";

/** Same header the old Python export wrote. */
const HEADER =
	"date,lat,lon,country_code,country,city,source,is_video,filename,uuid";

/** Deterministic PRNG (mulberry32), so the generated files never change by accident. */
function random(seed: number): () => number {
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
	const c = COUNTRIES[code];
	if (!c) throw new Error(`Unknown country ${code}`);
	return c;
}

/** Countries visited on one day, in order, with the share of the trip leg already done. */
function placesOn(day: string): { code: string; progress: number }[] {
	for (const trip of TRIPS) {
		const first = trip.legs[0];
		const last = trip.legs[trip.legs.length - 1];
		if (!first || !last || day < first.from || day > last.to) continue;
		const places: { code: string; progress: number }[] = [];
		if (day === first.from) places.push({ code: HOME, progress: 0 });
		for (const leg of trip.legs) {
			if (day < leg.from || day > leg.to) continue;
			const total = Date.parse(leg.to) - Date.parse(leg.from);
			const done = Date.parse(day) - Date.parse(leg.from);
			places.push({ code: leg.country, progress: done / total });
		}
		if (day === last.to) places.push({ code: HOME, progress: 0 });
		return places;
	}
	return [{ code: HOME, progress: 0 }];
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function locationsCsv(): { csv: string; rows: number } {
	const rand = random(20161);
	const lines = [HEADER];
	let n = 0;
	for (const day of days(LOCATIONS_FROM, LOCATIONS_TO)) {
		const places = placesOn(day);
		const travelling = places.length > 1 || places[0]?.code !== HOME;
		const count = travelling
			? 8 + Math.floor(rand() * 10)
			: rand() < 0.35
				? 0
				: 1 + Math.floor(rand() * 3);
		const minutes = Array.from(
			{ length: count },
			() => 8 * 60 + Math.floor(rand() * 14 * 60),
		).sort((a, b) => a - b);
		const month = Number(day.slice(5, 7));
		for (const minute of minutes) {
			// Each place gets an equal slice of the 08:00–22:00 window.
			const slot = Math.min(
				places.length - 1,
				Math.floor(((minute - 8 * 60) / (14 * 60)) * places.length),
			);
			const place = places[slot] ?? { code: HOME, progress: 0 };
			const c = country(place.code);
			const city =
				place.code === HOME
					? (c.cities[rand() < 0.8 ? 0 : 1 + Math.floor(rand() * 2)] ??
						c.cities[0])
					: c.cities[
							Math.min(
								c.cities.length - 1,
								Math.floor(place.progress * c.cities.length),
							)
						];
			if (!city) throw new Error(`No city for ${place.code}`);
			const tz = month >= 4 && month <= 10 ? c.tz.summer : c.tz.winter;
			const time = `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:${pad(Math.floor(rand() * 60))}`;
			n++;
			lines.push(
				[
					`${day}T${time}${tz}`,
					(city.lat + (rand() - 0.5) * 0.06).toFixed(6),
					(city.lon + (rand() - 0.5) * 0.06).toFixed(6),
					c.code,
					c.name,
					city.name,
					rand() < 0.05 ? "offline" : "apple",
					rand() < 0.06 ? "True" : "False",
					`DEMO_${pad(n, 5)}.JPG`,
					`demo-${pad(n, 6)}`,
				].join(","),
			);
		}
	}
	return { csv: `${lines.join("\n")}\n`, rows: n };
}
