import {
	DURATION_LABELS,
	EVIDENCE_LABELS,
	type ExploreFilters,
	KIND_LABELS,
	methodLabel,
	type Stay,
	yearRange,
} from "@voyput/core";

/** One active filter as a small removable chip: its label and the patch that removes it. */
export interface FilterChip {
	id: string;
	label: string;
	remove: Partial<ExploreFilters>;
}

/** The filters that differ from the defaults, one chip each (one per country and stay). */
export function activeFilterChips(
	filters: ExploreFilters,
	defaults: ExploreFilters,
	stays: readonly Stay[],
): FilterChip[] {
	const chips: FilterChip[] = [];
	if (filters.from !== defaults.from || filters.to !== defaults.to) {
		const year = Number(filters.from.slice(0, 4));
		const range = yearRange(year, stays);
		const label =
			range.from === filters.from && range.to === filters.to
				? String(year)
				: `${filters.from || "…"} – ${filters.to || "…"}`;
		chips.push({
			id: "dates",
			label,
			remove: { from: defaults.from, to: defaults.to },
		});
	}
	const names = new Map(stays.map((s) => [s.countryCode, s.country]));
	for (const code of filters.countries)
		chips.push({
			id: `country:${code}`,
			label: names.get(code) ?? code,
			remove: { countries: filters.countries.filter((c) => c !== code) },
		});
	for (const id of filters.stayIds) {
		const stay = stays.find((s) => s.id === id);
		chips.push({
			id: `stay:${id}`,
			label: stay ? `${stay.country} ${stay.start} – ${stay.end}` : "One stay",
			remove: { stayIds: filters.stayIds.filter((s) => s !== id) },
		});
	}
	if (filters.region !== "all")
		chips.push({
			id: "region",
			label: filters.region,
			remove: { region: "all" },
		});
	if (filters.kind !== "all")
		chips.push({
			id: "kind",
			label: KIND_LABELS[filters.kind],
			remove: { kind: "all" },
		});
	if (filters.method !== "all")
		chips.push({
			id: "method",
			label: `By ${methodLabel(filters.method).toLowerCase()}`,
			remove: { method: "all" },
		});
	if (filters.evidence !== "all")
		chips.push({
			id: "evidence",
			label: EVIDENCE_LABELS[filters.evidence],
			remove: { evidence: "all" },
		});
	if (filters.duration !== "all")
		chips.push({
			id: "duration",
			label: DURATION_LABELS[filters.duration],
			remove: { duration: "all" },
		});
	if (filters.search.trim())
		chips.push({
			id: "search",
			label: `“${filters.search.trim()}”`,
			remove: { search: "" },
		});
	return chips;
}
