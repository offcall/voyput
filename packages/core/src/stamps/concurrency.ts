/**
 * Like `Promise.all(items.map(task))`, but with at most `concurrency` tasks running at once.
 * Results keep the input order. `task` should not throw.
 *
 * N workers each take the next unclaimed index; `next++` is synchronous,
 * so two workers never claim the same item.
 */
export const mapConcurrent = async <T, R>(
	items: readonly T[],
	concurrency: number,
	task: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const index = next++;
			results[index] = await task(items[index] as T, index);
		}
	};
	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, worker));
	return results;
};
