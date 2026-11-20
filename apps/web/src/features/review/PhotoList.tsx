import { type CheckedStamp, photoSeverity } from "@voyput/core";
import { useEffect, useRef } from "react";
import type { PhotoRecord } from "../../db/db";
import { pageInView, pageProgress, type ReviewView } from "./queue";
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
	const listRef = useRef<HTMLUListElement>(null);
	// The page shown slides into the strip (sideways only, the page does not scroll).
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when another page is shown
	useEffect(() => {
		const list = listRef.current;
		const item = list?.querySelector<HTMLElement>("[aria-current='true']");
		if (!list || !item) return;
		const box = item.getBoundingClientRect();
		const frame = list.getBoundingClientRect();
		if (box.left < frame.left || box.right > frame.right)
			list.scrollTo?.({
				left: list.scrollLeft + box.left - frame.left,
				behavior: "smooth",
			});
	}, [currentId]);
	return (
		<nav className="review-list" aria-label="Review photos">
			{visible.length === 0 ? (
				<p className="review-empty" data-size="small">
					{view === "attention"
						? "No page needs attention."
						: "No pages in this view."}
				</p>
			) : (
				<ul ref={listRef} className="review-strip-list">
					{visible.map((photo) => {
						const items = stampsOf(photo.id);
						const level = photoSeverity(items);
						const { reviewed, total, problems } = pageProgress(items);
						const done = total > 0 && reviewed === total;
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
										{total === 0 ? (
											"no stamps"
										) : (
											<>
												<span
													className="review-photo-row-count"
													title={`${reviewed} of ${total} ${total === 1 ? "stamp" : "stamps"} reviewed`}
												>
													{reviewed}/{total} ✓
												</span>
												{problems > 0 ? (
													<span
														className="review-photo-row-problems"
														title={`${problems} with a problem`}
													>
														<span aria-hidden="true">{problems} ?</span>
														<span className="vp-visually-hidden">
															{problems} with a problem
														</span>
													</span>
												) : null}
												{level === "warning" ? " · photo location" : ""}
											</>
										)}
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
