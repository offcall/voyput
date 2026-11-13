import {
	type FilteredStay,
	methodLabel,
	pageRecords,
	type RecordSort,
	recordsCsv,
	SOURCE_LABELS,
	sortRecords,
} from "@voyput/core";
import { Button, CountryChip } from "@voyput/ui";
import { useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { downloadText } from "./download";

const COLUMNS: { key: RecordSort | null; label: string }[] = [
	{ key: "country", label: "Country" },
	{ key: "start", label: "Dates" },
	{ key: "days", label: "Days" },
	{ key: null, label: "Kind · entry" },
	{ key: null, label: "Date sources" },
	{ key: "stamps", label: "Stamps" },
	{ key: null, label: "Places" },
];

export const CSV_FILENAME = "voyput-stays.csv";

/** The filtered stays as a sortable, paged table with a CSV download of all of them. */
export function StayRecords({
	rows,
	selectedId,
	onPick,
}: {
	rows: readonly FilteredStay[];
	selectedId: string | null;
	onPick: (stay: FilteredStay) => void;
}) {
	const colourOf = useCountryColour();
	const [sort, setSort] = useState<RecordSort>("start");
	const [descending, setDescending] = useState(true);
	const [page, setPage] = useState(0);
	const sorted = sortRecords(rows, sort, descending);
	// pageRecords clamps, so a shorter list after a filter change shows its last page.
	const view = pageRecords(sorted, page);

	const sortBy = (key: RecordSort) => {
		if (key === sort) setDescending(!descending);
		else {
			setSort(key);
			setDescending(key !== "country");
		}
		setPage(0);
	};

	return (
		<>
			<div className="vp-explore-toolbar">
				<span className="vp-viz-muted">
					{rows.length} {rows.length === 1 ? "stay" : "stays"}
				</span>
				<Button
					size="sm"
					variant="secondary"
					onClick={() => downloadText(CSV_FILENAME, recordsCsv(sorted))}
				>
					Download CSV
				</Button>
			</div>
			<div className="vp-viz-scroll">
				<table className="vp-viz-table vp-explore-records">
					<thead>
						<tr>
							{COLUMNS.map((col) => {
								const key = col.key;
								return (
									<th
										key={col.label}
										aria-sort={
											key === sort
												? descending
													? "descending"
													: "ascending"
												: undefined
										}
									>
										{key ? (
											<button type="button" onClick={() => sortBy(key)}>
												{col.label}
												<span aria-hidden="true">
													{key === sort ? (descending ? " ▼" : " ▲") : ""}
												</span>
											</button>
										) : (
											col.label
										)}
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{view.rows.map((r) => (
							<tr key={r.id} data-selected={r.id === selectedId || undefined}>
								<td>
									<button
										type="button"
										className="vp-explore-link"
										aria-pressed={r.id === selectedId}
										onClick={() => onPick(r)}
									>
										<CountryChip
											code={r.countryCode}
											name={r.country}
											colour={colourOf(r.countryCode)}
										/>
									</button>
								</td>
								<td>
									{r.start} → {r.end}
								</td>
								<td>
									{r.clippedDays}
									{r.clippedDays !== r.days ? (
										<span className="vp-viz-muted"> / {r.days}</span>
									) : null}
								</td>
								<td>
									{r.home ? "Home" : r.kind === "transit" ? "Transit" : "Stay"}{" "}
									· {methodLabel(r.entry.method)}
								</td>
								<td>
									{SOURCE_LABELS[r.entry.source]} /{" "}
									{SOURCE_LABELS[r.exit.source]}
								</td>
								<td>{r.stamps}</td>
								<td className="vp-explore-place">{r.place || "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{view.pages > 1 ? (
				<nav className="vp-explore-pager" aria-label="Record pages">
					<Button
						size="sm"
						disabled={view.page === 0}
						onClick={() => setPage(view.page - 1)}
					>
						Previous
					</Button>
					<span>
						Page {view.page + 1} of {view.pages}
					</span>
					<Button
						size="sm"
						disabled={view.page + 1 >= view.pages}
						onClick={() => setPage(view.page + 1)}
					>
						Next
					</Button>
				</nav>
			) : null}
		</>
	);
}
