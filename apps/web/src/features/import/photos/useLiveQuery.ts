import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

/**
 * Result of a Dexie query that re-runs whenever the tables it read change; undefined while loading.
 * Pass a memoized `query` (useCallback), otherwise it resubscribes on every render.
 */
export function useLiveQuery<T>(query: () => Promise<T>): T | undefined {
	const [value, setValue] = useState<T>();
	useEffect(() => {
		const subscription = liveQuery(query).subscribe({
			next: setValue,
			error: (error: unknown) => console.error(error),
		});
		return () => subscription.unsubscribe();
	}, [query]);
	return value;
}
