import type {
	CountryGroup,
	FilteredStay,
	ExploreFilters as Filters,
} from "@voyput/core";
import { useState } from "react";
import { CountryDetail, StayDetail } from "./ExploreDetail";

type Selection =
	| { type: "stay"; id: string }
	| { type: "country"; code: string }
	| null;

/**
 * The stay or country the user clicked in a chart, and its detail panel.
 * The panel's "Show only …" buttons narrow the shared filter.
 */
export function useSelection({
	rows,
	groups,
	filters,
	onFilter,
}: {
	rows: readonly FilteredStay[];
	groups: readonly CountryGroup[];
	filters: Filters;
	onFilter: (patch: Partial<Filters>) => void;
}) {
	const [selection, setSelection] = useState<Selection>(null);
	const pickStay = (stay: { id: string }) =>
		setSelection({ type: "stay", id: stay.id });
	const pickCountry = (code: string) => setSelection({ type: "country", code });
	const close = () => setSelection(null);

	const stay =
		selection?.type === "stay"
			? (rows.find((r) => r.id === selection.id) ?? null)
			: null;
	const country =
		selection?.type === "country"
			? (groups.find((g) => g.countryCode === selection.code) ?? null)
			: null;

	const detail = stay ? (
		<StayDetail
			stay={stay}
			filtered={filters.stayIds.length === 1 && filters.stayIds[0] === stay.id}
			onCountry={pickCountry}
			onFilter={() => onFilter({ stayIds: [stay.id] })}
			onClose={close}
		/>
	) : country ? (
		<CountryDetail
			group={country}
			visits={rows.filter((r) => r.countryCode === country.countryCode)}
			filtered={
				filters.countries.length === 1 &&
				filters.countries[0] === country.countryCode
			}
			onStay={pickStay}
			onFilter={() => onFilter({ countries: [country.countryCode] })}
			onClose={close}
		/>
	) : null;

	return {
		selectedStayId: stay?.id ?? null,
		selectedCountry: country?.countryCode ?? null,
		pickStay,
		pickCountry,
		close,
		detail,
	};
}
