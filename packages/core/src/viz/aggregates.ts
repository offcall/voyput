import type { LocationRow } from "../locations/types";
import { haversineKm } from "./geo";

/** A run of consecutive days whose dominant country is the same. */
export interface Movement {
	code: string;
	country: string;
	/** First day, `YYYY-MM-DD`. */
	start: string;
	/** Last day, `YYYY-MM-DD`. */
	end: string;
	photos: number;
}

export interface CountryStat {
	code: string;
	country: string;
	photos: number;
	/** Photos per year, keyed by `YYYY`. */
	years: Record<string, number>;
}

export interface CityPoint {
	name: string;
	code: string;
	country: string;
	lat: number;
	lon: number;
	photos: number;
	start: string;
	end: string;
}

export interface Transition {
	from: string;
	to: string;
	count: number;
}

export interface DistanceSegment {
	km: number;
	hours: number;
	fromCode: string;
	fromCountry: string;
	fromDate: string;
	toCode: string;
	toCountry: string;
	toDate: string;
}

export interface Distances {
	totalKm: number;
	spanDays: number;
	avgPerDayKm: number;
	longestKm: number;
	segmentCount: number;
	perYear: { year: string; km: number }[];
	/** The ten longest jumps, longest first. */
	top: DistanceSegment[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z]{2}$/;
const CITY_POINT_LIMIT = 400;
const TOP_SEGMENTS = 10;

function dayOf(row: LocationRow): string | null {
	const day = row.date.slice(0, 10);
	return DAY_RE.test(day) ? day : null;
}

function codeOf(row: LocationRow): string | null {
	const code = row.countryCode.trim().toUpperCase();
	return CODE_RE.test(code) ? code : null;
}

function hasCoords(row: LocationRow): boolean {
	return Number.isFinite(row.lat) && Number.isFinite(row.lon);
}

/** Collapses days into country periods: each day counts for its most photographed country. */
export function buildMovements(rows: readonly LocationRow[]): Movement[] {
	const byDay = new Map<
		string,
		{ total: number; countries: Map<string, { country: string; n: number }> }
	>();
	for (const row of rows) {
		const day = dayOf(row);
		const code = codeOf(row);
		if (!day || !code) continue;
		let bucket = byDay.get(day);
		if (!bucket) {
			bucket = { total: 0, countries: new Map() };
			byDay.set(day, bucket);
		}
		bucket.total++;
		const current = bucket.countries.get(code);
		if (current) current.n++;
		else bucket.countries.set(code, { country: row.country || code, n: 1 });
	}

	const movements: Movement[] = [];
	const days = [...byDay.keys()].sort();
	for (const day of days) {
		const bucket = byDay.get(day);
		if (!bucket) continue;
		let topCode = "";
		let top = { country: "", n: 0 };
		for (const [code, entry] of bucket.countries) {
			if (entry.n > top.n) {
				topCode = code;
				top = entry;
			}
		}
		const previous = movements.at(-1);
		if (previous?.code === topCode) {
			previous.end = day;
			previous.photos += bucket.total;
		} else {
			movements.push({
				code: topCode,
				country: top.country,
				start: day,
				end: day,
				photos: bucket.total,
			});
		}
	}
	return movements;
}

/** Photos per country (and per year), most photographed first. */
export function buildCountryCounts(
	rows: readonly LocationRow[],
): CountryStat[] {
	const counts = new Map<string, CountryStat>();
	for (const row of rows) {
		const code = codeOf(row);
		if (!code) continue;
		const year = dayOf(row)?.slice(0, 4);
		let stat = counts.get(code);
		if (!stat) {
			stat = { code, country: row.country || code, photos: 0, years: {} };
			counts.set(code, stat);
		}
		stat.photos++;
		if (year) stat.years[year] = (stat.years[year] ?? 0) + 1;
	}
	return [...counts.values()].sort((a, b) => b.photos - a.photos);
}

/** Photo spots rounded to ~1 km, the 400 most photographed. */
export function buildCityPoints(rows: readonly LocationRow[]): CityPoint[] {
	const byKey = new Map<string, CityPoint>();
	for (const row of rows) {
		const day = dayOf(row);
		const code = codeOf(row);
		if (!day || !code || !hasCoords(row)) continue;
		const key = `${code}|${row.lat.toFixed(2)}|${row.lon.toFixed(2)}`;
		const point = byKey.get(key);
		if (point) {
			point.photos++;
			if (day < point.start) point.start = day;
			if (day > point.end) point.end = day;
		} else {
			byKey.set(key, {
				name: row.city || row.country || code,
				code,
				country: row.country || code,
				lat: row.lat,
				lon: row.lon,
				photos: 1,
				start: day,
				end: day,
			});
		}
	}
	return [...byKey.values()]
		.sort((a, b) => b.photos - a.photos)
		.slice(0, CITY_POINT_LIMIT);
}

/** Country-to-country moves between consecutive movements, most frequent first. */
export function buildTransitions(movements: readonly Movement[]): Transition[] {
	const counts = new Map<string, Transition>();
	for (let i = 1; i < movements.length; i++) {
		const from = movements[i - 1]?.code;
		const to = movements[i]?.code;
		if (!from || !to || from === to) continue;
		const key = `${from}->${to}`;
		const current = counts.get(key);
		if (current) current.count++;
		else counts.set(key, { from, to, count: 1 });
	}
	return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Photos per day, keyed by `YYYY-MM-DD`. */
export function buildDayCounts(
	rows: readonly LocationRow[],
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const day = dayOf(row);
		if (day) counts[day] = (counts[day] ?? 0) + 1;
	}
	return counts;
}

/** Great-circle distance between photos adjacent in time. */
export function buildDistances(rows: readonly LocationRow[]): Distances {
	const points: {
		t: number;
		day: string;
		lat: number;
		lon: number;
		code: string;
		country: string;
	}[] = [];
	for (const row of rows) {
		const code = codeOf(row);
		const day = dayOf(row);
		const t = Date.parse(row.date);
		if (!code || !day || !hasCoords(row) || !Number.isFinite(t)) continue;
		points.push({
			t,
			day,
			lat: row.lat,
			lon: row.lon,
			code,
			country: row.country || code,
		});
	}
	points.sort((a, b) => a.t - b.t);

	const segments: DistanceSegment[] = [];
	const perYear = new Map<string, number>();
	let totalKm = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (!a || !b) continue;
		const km = haversineKm(a.lat, a.lon, b.lat, b.lon);
		totalKm += km;
		const year = a.day.slice(0, 4);
		perYear.set(year, (perYear.get(year) ?? 0) + km);
		segments.push({
			km,
			hours: (b.t - a.t) / 3_600_000,
			fromCode: a.code,
			fromCountry: a.country,
			fromDate: a.day,
			toCode: b.code,
			toCountry: b.country,
			toDate: b.day,
		});
	}

	const first = points[0];
	const last = points.at(-1);
	const spanDays =
		first && last && points.length > 1
			? Math.max(1, (last.t - first.t) / 86_400_000)
			: 0;
	const top = segments
		.slice()
		.sort((a, b) => b.km - a.km)
		.slice(0, TOP_SEGMENTS);
	return {
		totalKm,
		spanDays: Math.round(spanDays),
		avgPerDayKm: spanDays > 0 ? totalKm / spanDays : 0,
		longestKm: top[0]?.km ?? 0,
		segmentCount: segments.length,
		perYear: [...perYear.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([year, km]) => ({ year, km })),
		top,
	};
}

/** Flat `[lat, lon, lat, lon, …]` rounded to 0.01°, compact for 30k rows. */
export function buildHeatPoints(rows: readonly LocationRow[]): Float32Array {
	const out: number[] = [];
	for (const row of rows) {
		if (!codeOf(row) || !hasCoords(row)) continue;
		out.push(Math.round(row.lat * 100) / 100, Math.round(row.lon * 100) / 100);
	}
	return Float32Array.from(out);
}
