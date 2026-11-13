import { methodLabel, SOURCE_LABELS } from "./labels";
import type { FilteredStay } from "./types";

export type RecordSort = "start" | "days" | "country" | "stamps";

export const RECORD_PAGE_SIZE = 25;

/** Rows sorted by `key`; ties keep the original order. */
export function sortRecords(
	rows: readonly FilteredStay[],
	key: RecordSort,
	descending: boolean,
): FilteredStay[] {
	const compare = (a: FilteredStay, b: FilteredStay): number => {
		switch (key) {
			case "country":
				return a.country.localeCompare(b.country);
			case "days":
				return a.clippedDays - b.clippedDays;
			case "stamps":
				return a.stamps - b.stamps;
			default:
				return a.start.localeCompare(b.start);
		}
	};
	return [...rows].sort((a, b) => (descending ? compare(b, a) : compare(a, b)));
}

export interface RecordPage {
	rows: FilteredStay[];
	/** 0-based, clamped to the pages there are. */
	page: number;
	/** At least 1. */
	pages: number;
}

export function pageRecords(
	rows: readonly FilteredStay[],
	page: number,
	size = RECORD_PAGE_SIZE,
): RecordPage {
	const pages = Math.max(1, Math.ceil(rows.length / size));
	const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
	return { rows: rows.slice(p * size, p * size + size), page: p, pages };
}

const CSV_COLUMNS: readonly [string, (r: FilteredStay) => string | number][] = [
	["country", (r) => r.country],
	["code", (r) => r.countryCode],
	["start", (r) => r.start],
	["end", (r) => r.end],
	["clip_start", (r) => r.clipStart],
	["clip_end", (r) => r.clipEnd],
	["days", (r) => r.days],
	["days_in_range", (r) => r.clippedDays],
	["kind", (r) => (r.home ? "home" : r.kind)],
	["entry_method", (r) => methodLabel(r.entry.method)],
	["entry_source", (r) => SOURCE_LABELS[r.entry.source]],
	["exit_method", (r) => methodLabel(r.exit.method)],
	["exit_source", (r) => SOURCE_LABELS[r.exit.source]],
	["stamps", (r) => r.stamps],
	["stop_days", (r) => r.stopDays],
	["place", (r) => r.place],
	["trip", (r) => r.tripTitle],
];

const csvCell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;

/** CSV of the rows, every cell quoted, CRLF lines, with a BOM so spreadsheets read UTF-8. */
export function recordsCsv(rows: readonly FilteredStay[]): string {
	const lines = [
		CSV_COLUMNS.map(([name]) => csvCell(name)).join(","),
		...rows.map((r) => CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(",")),
	];
	return `﻿${lines.join("\r\n")}`;
}
