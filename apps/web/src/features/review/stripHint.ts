import { useCallback } from "react";
import { useLiveQuery } from "../../data/useLiveQuery";
import { useDb } from "../../db/DbContext";
import type { VoyputDb } from "../../db/db";

/** `kv` key set once the user dragged a day strip or closed its hint. */
export const STRIP_HINT_KEY = "review:stripHintSeen";

export async function dismissStripHint(db: VoyputDb): Promise<void> {
	await db.kv.put({ key: STRIP_HINT_KEY, value: true });
}

/**
 * The one-time "drag" hint of the day strips: shown until the first drag or ×,
 * then never again; every open strip follows at once. Hidden while loading.
 */
export interface StripHint {
	show: boolean;
	dismiss: () => void;
}

export function useStripHint(): StripHint {
	const db = useDb();
	const { data: seen } = useLiveQuery(
		useCallback(
			async () => (await db.kv.get(STRIP_HINT_KEY))?.value === true,
			[db],
		),
	);
	return {
		show: seen === false,
		dismiss: () => void dismissStripHint(db),
	};
}
