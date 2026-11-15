import { type CheckedStamp, photoSeverity } from "@voyput/core";
import type { PhotoRecord } from "../../db/db";
import { pageInView, type ReviewView } from "./queue";
import { Thumb } from "./Thumb";

/** The pages in the chosen view, as a strip of thumbnails. */
export function PhotoList({
	photos,
	stampsOf,
	view,
	currentId,
	onSelect,
}: {
	photos: readonly PhotoRecord[];
	stampsOf: (photoId: string) => readonly CheckedStamp[];
	view: ReviewView;
	currentId: string | null;
	onSelect: (photoId: string) => void;
}) {
	const visible = photos.filter((photo) =>
		pageInView(stampsOf(photo.id), view),
	);
	return (
		<nav className="review-list" aria-label="Review photos">
			{visible.length === 0 ? (
				<p className="review-empty" data-size="small">
					{view === "attention"
						? "No page needs attention."
						: "No pages in this view."}
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
										{level === "warning" ? " · photo location" : ""}
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
