import { useState } from "react";

/** Lists start short: ranked lists show this many until the user asks for all. */
export const SHOWN_AT_FIRST = 10;

/**
 * The first `limit` items and a "Show all N" toggle (null when everything
 * already fits), for long ranked lists.
 */
export function useShowAll<T>(items: readonly T[], limit = SHOWN_AT_FIRST) {
	const [all, setAll] = useState(false);
	const shown = all ? items : items.slice(0, limit);
	const toggle =
		items.length > limit ? (
			<button
				type="button"
				className="vp-insights-more"
				aria-expanded={all}
				onClick={() => setAll(!all)}
			>
				{all ? `Show top ${limit}` : `Show all ${items.length}`}
			</button>
		) : null;
	return { shown, toggle };
}
