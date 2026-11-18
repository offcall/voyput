import { liveQuery } from "dexie";
import { useEffect, useState } from "react";

export interface LiveQueryResult<T> {
	/** Undefined while loading. */
	data: T | undefined;
	/** Message of the last failed read, null while reads succeed. */
	error: string | null;
}

/**
 * Result of a Dexie query that re-runs whenever the tables it read change.
 * Pass a memoized `query` (useCallback), otherwise it resubscribes on every render.
 */
export function useLiveQuery<T>(query: () => Promise<T>): LiveQueryResult<T> {
	const [result, setResult] = useState<LiveQueryResult<T>>({
		data: undefined,
		error: null,
	});
	useEffect(() => {
		const subscription = liveQuery(query).subscribe({
			next: (data) => setResult({ data, error: null }),
			error: (error: unknown) =>
				setResult((previous) => ({
					data: previous.data,
					error: error instanceof Error ? error.message : String(error),
				})),
		});
		return () => subscription.unsubscribe();
	}, [query]);
	return result;
}
