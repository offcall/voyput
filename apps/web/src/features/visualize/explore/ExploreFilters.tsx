import {
	DURATION_LABELS,
	type DurationFilter,
	EVIDENCE_LABELS,
	type EvidenceFilter,
	type ExploreFilters as Filters,
	KIND_LABELS,
	type KindFilter,
	METHOD_LABELS,
	REGIONS,
	type Stay,
	stayCountries,
	stayYears,
	yearRange,
} from "@voyput/core";
import { Button, flagEmoji } from "@voyput/ui";
import { useMemo } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { Chip, ChipGroup } from "./Chip";

const keys = <K extends string>(labels: Readonly<Record<K, string>>) =>
	Object.keys(labels) as K[];

/** The filter bar: date range with year shortcuts, then every stay filter as chips. */
export function ExploreFilters({
	stays,
	filters,
	defaults,
	onChange,
	onReset,
	scope,
}: {
	stays: readonly Stay[];
	filters: Filters;
	defaults: Filters;
	onChange: (patch: Partial<Filters>) => void;
	onReset: () => void;
	/** "4 of 6 stays", read out when it changes. */
	scope: string;
}) {
	const colourOf = useCountryColour();
	const options = useMemo(() => {
		const regions = new Set(stays.map((s) => s.region));
		const methods = new Set<string>(stays.map((s) => s.entry.method));
		return {
			years: stayYears(stays),
			countries: stayCountries(stays),
			names: new Map(stays.map((s) => [s.countryCode, s.country])),
			regions: REGIONS.filter((r) => regions.has(r)),
			methods: Object.keys(METHOD_LABELS).filter((m) => methods.has(m)),
		};
	}, [stays]);

	const isRange = (from: string, to: string) =>
		filters.from === from && filters.to === to;
	const toggleCountry = (code: string) =>
		onChange({
			countries: filters.countries.includes(code)
				? filters.countries.filter((c) => c !== code)
				: [...filters.countries, code],
		});

	return (
		<section className="vp-explore-filters" aria-label="Filters">
			<div className="vp-explore-filter-top">
				<div className="vp-explore-dates">
					<label>
						<span className="vp-explore-field-label">From</span>
						<input
							className="vp-input"
							type="date"
							value={filters.from}
							onChange={(e) => onChange({ from: e.target.value })}
						/>
					</label>
					<label>
						<span className="vp-explore-field-label">To</span>
						<input
							className="vp-input"
							type="date"
							value={filters.to}
							onChange={(e) => onChange({ to: e.target.value })}
						/>
					</label>
				</div>
				<label className="vp-explore-search">
					<span className="vp-explore-field-label">Search</span>
					<input
						className="vp-input"
						type="search"
						placeholder="Country or city"
						value={filters.search}
						onChange={(e) => onChange({ search: e.target.value })}
					/>
				</label>
			</div>

			<ChipGroup label="Years">
				<Chip
					selected={isRange(defaults.from, defaults.to)}
					onClick={() => onChange({ from: defaults.from, to: defaults.to })}
				>
					All years
				</Chip>
				{options.years.map((year) => {
					const range = yearRange(year, stays);
					return (
						<Chip
							key={year}
							selected={isRange(range.from, range.to)}
							onClick={() => onChange(range)}
						>
							{year}
						</Chip>
					);
				})}
			</ChipGroup>

			<ChipGroup label="Region">
				<Chip
					selected={filters.region === "all"}
					onClick={() => onChange({ region: "all" })}
				>
					All regions
				</Chip>
				{options.regions.map((region) => (
					<Chip
						key={region}
						selected={filters.region === region}
						onClick={() => onChange({ region })}
					>
						{region}
					</Chip>
				))}
			</ChipGroup>

			<ChipGroup label="Kind">
				{keys<KindFilter>(KIND_LABELS).map((kind) => (
					<Chip
						key={kind}
						selected={filters.kind === kind}
						onClick={() => onChange({ kind })}
					>
						{KIND_LABELS[kind]}
					</Chip>
				))}
			</ChipGroup>

			<details className="vp-explore-more">
				<summary>
					More filters
					<span className="vp-viz-muted">
						{" "}
						· countries
						{filters.countries.length
							? ` (${filters.countries.length} selected)`
							: ""}
						, entry, evidence, length
					</span>
				</summary>
				<ChipGroup label="Countries">
					<Chip
						selected={filters.countries.length === 0}
						onClick={() => onChange({ countries: [] })}
					>
						All countries
					</Chip>
					{options.countries.map((code) => (
						<Chip
							key={code}
							selected={filters.countries.includes(code)}
							onClick={() => toggleCountry(code)}
							colour={colourOf(code)}
						>
							{flagEmoji(code)} {options.names.get(code) ?? code}
						</Chip>
					))}
				</ChipGroup>
				<ChipGroup label="Entry">
					<Chip
						selected={filters.method === "all"}
						onClick={() => onChange({ method: "all" })}
					>
						Any entry
					</Chip>
					{options.methods.map((method) => (
						<Chip
							key={method}
							selected={filters.method === method}
							onClick={() => onChange({ method })}
						>
							{METHOD_LABELS[method]}
						</Chip>
					))}
				</ChipGroup>
				<ChipGroup label="Evidence">
					{keys<EvidenceFilter>(EVIDENCE_LABELS).map((evidence) => (
						<Chip
							key={evidence}
							selected={filters.evidence === evidence}
							onClick={() => onChange({ evidence })}
						>
							{EVIDENCE_LABELS[evidence]}
						</Chip>
					))}
				</ChipGroup>
				<ChipGroup label="Length">
					{keys<DurationFilter>(DURATION_LABELS).map((duration) => (
						<Chip
							key={duration}
							selected={filters.duration === duration}
							onClick={() => onChange({ duration })}
						>
							{DURATION_LABELS[duration]}
						</Chip>
					))}
				</ChipGroup>
			</details>

			<div className="vp-explore-filter-foot">
				<output aria-live="polite">{scope}</output>
				<Button size="sm" onClick={onReset}>
					Reset filters
				</Button>
			</div>
		</section>
	);
}
