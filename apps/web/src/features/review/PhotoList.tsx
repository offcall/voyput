import {
	type CheckedStamp,
	photoMatches,
	photoSeverity,
	REVIEW_FILTERS,
	type ReviewFilter,
} from "@voyput/core";
import type { PhotoRecord } from "../../db/db";

const FILTER_LABELS: Record<ReviewFilter, string> = {
	all: "All",
	problem: "Problems",
	icloud: "Location mismatch",
	empty: "No stamps",
	unreviewed: "Unreviewed",
	reviewed: "Reviewed",
};

/** Photos with their stamps, filtered, as a navigation list. */
export function PhotoList({
	photos,
	stampsOf,
	filter,
	currentId,
	onFilter,
	onSelect,
}: {
	photos: readonly PhotoRecord[];
	stampsOf: (photoId: string) => readonly CheckedStamp[];
	filter: ReviewFilter;
	currentId: string | null;
	onFilter: (filter: ReviewFilter) => void;
	onSelect: (photoId: string) => void;
}) {
	const visible = photos.filter((photo) =>
		photoMatches(stampsOf(photo.id), filter),
	);
	return (
		<nav className="review-list" aria-label="Review photos">
			<fieldset className="review-filters" aria-label="Filter photos">
				{REVIEW_FILTERS.map((key) => (
					<button
						key={key}
						type="button"
						className="review-chip"
						aria-pressed={filter === key}
						onClick={() => onFilter(key)}
					>
						{FILTER_LABELS[key]}{" "}
						<span className="review-muted">
							{photos.filter((p) => photoMatches(stampsOf(p.id), key)).length}
						</span>
					</button>
				))}
			</fieldset>
			{visible.length === 0 ? (
				<p className="review-muted">No photos match this filter.</p>
			) : (
				<ul>
					{visible.map((photo) => {
						const items = stampsOf(photo.id);
						const level = photoSeverity(items);
						const done =
							items.length > 0 && items.every((item) => item.stamp.reviewed);
						return (
							<li key={photo.id}>
								<button
									type="button"
									className="review-photo-row"
									data-severity={level}
									aria-current={photo.id === currentId || undefined}
									onClick={() => onSelect(photo.id)}
								>
									<span>{photo.name}</span>
									<span className="review-muted">
										{items.length === 0
											? "no stamps"
											: `${items.length} ${items.length === 1 ? "stamp" : "stamps"}`}
										{level === "critical" ? " · issue" : ""}
										{level === "warning" ? " · location" : ""}
										{done ? " · ✓" : ""}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</nav>
	);
}
