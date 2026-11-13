import { Button } from "@voyput/ui";
import { countryName, flagOf, plural, stayRange } from "../trips/format";

/** A stored stay as the chart filter lists it: first and last day known. */
export interface FilterStay {
	id: string;
	/** Position in the history, from 1. */
	number: number;
	countryCode: string;
	start: string;
	end: string;
}

/**
 * Narrows the charts to stays: a country picks all its stays, single stays
 * are listed below it. Nothing selected shows all data.
 */
export function StayFilter({
	stays,
	selected,
	onChange,
}: {
	stays: readonly FilterStay[];
	selected: ReadonlySet<string>;
	onChange: (selected: Set<string>) => void;
}) {
	if (stays.length === 0) return null;
	const byCountry = new Map<string, FilterStay[]>();
	for (const s of stays)
		byCountry.set(s.countryCode, [...(byCountry.get(s.countryCode) ?? []), s]);
	const countries = [...byCountry].sort((a, b) =>
		countryName(a[0]).localeCompare(countryName(b[0])),
	);
	const toggle = (ids: readonly string[], on: boolean) => {
		const next = new Set(selected);
		for (const id of ids) {
			if (on) next.add(id);
			else next.delete(id);
		}
		onChange(next);
	};
	return (
		<fieldset className="vp-viz-filter">
			<legend>Stays</legend>
			{countries.map(([cc, list]) => {
				const all = list.every((s) => selected.has(s.id));
				const some = !all && list.some((s) => selected.has(s.id));
				return (
					<label key={cc}>
						<input
							type="checkbox"
							checked={all}
							ref={(el) => {
								if (el) el.indeterminate = some;
							}}
							onChange={() =>
								toggle(
									list.map((s) => s.id),
									!all,
								)
							}
						/>
						<span aria-hidden="true">{flagOf(cc)}</span> {countryName(cc)}{" "}
						<span className="vp-viz-muted">{plural(list.length, "stay")}</span>
					</label>
				);
			})}
			<details className="vp-viz-filter-stays">
				<summary>Single stays</summary>
				<div className="vp-viz-filter-list">
					{stays.map((s) => (
						<label key={s.id}>
							<input
								type="checkbox"
								checked={selected.has(s.id)}
								onChange={() => toggle([s.id], !selected.has(s.id))}
							/>
							{s.number}.{" "}
							<span aria-hidden="true">{flagOf(s.countryCode)}</span>{" "}
							{countryName(s.countryCode)}{" "}
							<span className="vp-viz-muted">{stayRange(s.start, s.end)}</span>
						</label>
					))}
				</div>
			</details>
			<Button
				disabled={selected.size === 0}
				onClick={() => onChange(new Set())}
			>
				Show all data
			</Button>
		</fieldset>
	);
}
