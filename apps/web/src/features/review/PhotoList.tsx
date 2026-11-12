import {
	type CheckedStamp,
	photoMatches,
	photoSeverity,
	REVIEW_FILTERS,
	type ReviewFilter,
} from "@voyput/core";
import { useEffect, useState } from "react";
import type { PhotoRecord } from "../../db/db";

const FILTER_LABELS: Record<ReviewFilter, string> = {
	all: "All",
	problem: "Problems",
	icloud: "Location mismatch",
	empty: "No stamps",
	unreviewed: "Unreviewed",
	reviewed: "Reviewed",
};

/** A small picture of a page; the full photo scaled down by the browser. */
function Thumb({ photo }: { photo: PhotoRecord }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const next = URL.createObjectURL(photo.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [photo.blob]);
	return (
		<span className="review-thumb" data-rotation={photo.rotation}>
			{url ? (
				<img
					src={url}
					alt=""
					loading="lazy"
					style={{ transform: `rotate(${photo.rotation}deg)` }}
				/>
			) : null}
		</span>
	);
}

/** Photos with their stamps, filtered, as a strip of thumbnails. */
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
						data-filter={key}
						aria-pressed={filter === key}
						onClick={() => onFilter(key)}
					>
						{FILTER_LABELS[key]}{" "}
						<span className="review-chip-count">
							{photos.filter((p) => photoMatches(stampsOf(p.id), key)).length}
						</span>
					</button>
				))}
			</fieldset>
			{visible.length === 0 ? (
				<p className="review-empty" data-size="small">
					No photos match this filter.
				</p>
			) : (
				<ul className="review-strip-list">
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
									data-severity={items.length === 0 ? "empty" : level}
									data-done={done || undefined}
									aria-current={photo.id === currentId || undefined}
									onClick={() => onSelect(photo.id)}
								>
									<Thumb photo={photo} />
									<span className="review-photo-row-name">{photo.name}</span>
									<span className="review-photo-row-meta">
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
