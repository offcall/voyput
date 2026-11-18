/**
 * Frozen: do not edit. Copied from apps/web/src/db/db.ts and
 * packages/core/src/trips/{build,countries,types}.ts at commit 1cc43b2 on
 * 2026-11-18 (ADR 0039).
 *
 * Dexie version 5: no home any more (ADR 0022), so the home stays the
 * version 4 suggester generated and the home pick go. Only the logic this
 * upgrade runs is here; core changes must not reach it.
 */
import type { Transaction } from "dexie";

// Stored shapes as this upgrade reads them.

type TravelMethod =
	| "walk"
	| "car"
	| "bus"
	| "train"
	| "plane"
	| "ship"
	| "unknown";

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
}

interface KvRecord {
	key: string;
	value: unknown;
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

// trips/build.ts

const NEVER = "0000-00-00";
const ALWAYS = "9999-99-99";
const fromOf = (s: TravelStay) => s.arrival.date ?? NEVER;
const toOf = (s: TravelStay) => s.departure.date ?? ALWAYS;

/** Stays by arrival ("since birth" first), then by departure ("still there" last). */
function sortStays(stays: readonly TravelStay[]): TravelStay[] {
	return [...stays].sort(
		(a, b) =>
			fromOf(a).localeCompare(fromOf(b)) || toOf(a).localeCompare(toOf(b)),
	);
}

// db/db.ts

/** Ids the version 4 suggester gave: `stay-<arrival or birth>-<country>`, maybe with suffixes. */
const SUGGESTED_ID =
	/^stay-(?:\d{4}-\d{2}-\d{2}|birth)-([a-z]{2})(?:-home|-after|-\d+)*$/;

/** The country of most stays (transits left out), as version 4 read home. */
function mostStaysCountry(stays: readonly TravelStay[]): string | null {
	const counts = new Map<string, number>();
	for (const s of stays)
		if (s.kind === "stay")
			counts.set(s.countryCode, (counts.get(s.countryCode) ?? 0) + 1);
	let best: string | null = null;
	for (const [cc, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0])))
		if (best === null || n > (counts.get(best) ?? 0)) best = cc;
	return best;
}

/**
 * Stays the version 4 suggester made up to fill time at home, provably
 * untouched: in the home country under the id it was suggested with (a
 * changed country keeps its old id), kind `stay`, no stamp, photo, place or
 * approval, no date set by hand, and each travel method unknown or the one
 * the neighbouring stay gave it. Version 4 stored no `edited` flag, so
 * anything that may have been edited stays.
 */
export function generatedHomeStays(
	stays: readonly TravelStay[],
	pickedHome: string | null,
): Set<string> {
	const sorted = sortStays(stays);
	const home = pickedHome ?? mostStaysCountry(sorted);
	const out = new Set<string>();
	sorted.forEach((s, i) => {
		const prev = sorted[i - 1];
		const next = sorted[i + 1];
		const idCountry = SUGGESTED_ID.exec(s.id)?.[1];
		if (
			home !== null &&
			s.countryCode === home &&
			idCountry === home.toLowerCase() &&
			s.kind === "stay" &&
			s.stampIds.length === 0 &&
			s.photoIds.length === 0 &&
			s.place === "" &&
			!s.approved &&
			s.arrival.source === "estimated" &&
			s.departure.source === "estimated" &&
			(s.arrival.method === "unknown" ||
				s.arrival.method === prev?.departure.method) &&
			(s.departure.method === "unknown" ||
				s.departure.method === next?.arrival.method)
		)
			out.add(s.id);
	});
	return out;
}

/** Version 5: stored stays lose the provably generated home stays; `trips:home` goes. */
export async function dropHomeStays(tx: Transaction): Promise<void> {
	const kv = tx.table<KvRecord, string>("kv");
	const stays = tx.table<TravelStay, string>("stays");
	const picked = await kv.get("trips:home");
	const generated = generatedHomeStays(
		await stays.toArray(),
		isCountryCode(picked?.value) ? picked.value : null,
	);
	await stays.bulkDelete([...generated]);
	await kv.delete("trips:home");
}
