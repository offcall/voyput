import type { Move } from "./aggregates";

/** All moves from one country to another, counted. */
export interface MoveRoute {
	from: string;
	to: string;
	fromName: string;
	toName: string;
	count: number;
	/** First day in the new country of the latest move, `YYYY-MM-DD`. */
	last: string;
}

/** Year of a move: the year it arrived in the new country. */
const yearOf = (move: Move) => move.to.start.slice(0, 4);

/** Years with at least one move, ascending. */
export function moveYears(moves: readonly Move[]): string[] {
	return [...new Set(moves.map(yearOf))].sort();
}

/** Moves of one year (all when `year` is `null`) counted by route, most first. */
export function moveRoutes(
	moves: readonly Move[],
	year: string | null,
): MoveRoute[] {
	const routes = new Map<string, MoveRoute>();
	for (const move of moves) {
		if (year !== null && yearOf(move) !== year) continue;
		const key = `${move.from.code}>${move.to.code}`;
		const route = routes.get(key);
		if (route) {
			route.count++;
			if (move.to.start > route.last) route.last = move.to.start;
		} else {
			routes.set(key, {
				from: move.from.code,
				to: move.to.code,
				fromName: move.from.country,
				toName: move.to.country,
				count: 1,
				last: move.to.start,
			});
		}
	}
	return [...routes.values()].sort(
		(a, b) =>
			b.count - a.count ||
			b.last.localeCompare(a.last) ||
			`${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`),
	);
}
