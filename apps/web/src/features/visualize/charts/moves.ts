import type { MoveRoute } from "@voyput/core";

/** Bucket for countries outside the top of the Sankey. */
export const OTHER = "OTHER";

export interface SankeyNode {
	code: string;
	side: "from" | "to";
	/** Moves leaving (`from`) or arriving (`to`). */
	count: number;
	x: number;
	y: number;
	h: number;
}

export interface SankeyLink {
	/** Bucketed codes: a country of the top, or `OTHER`. */
	from: string;
	to: string;
	count: number;
	/** Closed band from the left node to the right one. */
	band: string;
	/** Centre line of the band, for the moving dots. */
	line: string;
	/** Band thickness. */
	width: number;
}

export interface SankeyLayout {
	width: number;
	height: number;
	nodes: SankeyNode[];
	links: SankeyLink[];
}

export const NODE_W = 14;
const GAP = 12;
/** Room beside the nodes for a code and a count. */
const LABEL = 76;
const PAD = 8;
/** Least room per node, about a label's height. */
const MIN_SLOT = 10;

/**
 * A two-column Sankey in pixel units: countries moved from on the left,
 * countries moved to on the right, one band per route as thick as its moves.
 * Countries beyond the `top` busiest share one "Other" node per side.
 */
export function layoutSankey(
	routes: readonly MoveRoute[],
	width: number,
	top = 10,
): SankeyLayout {
	const busy = new Map<string, number>();
	for (const r of routes) {
		busy.set(r.from, (busy.get(r.from) ?? 0) + r.count);
		busy.set(r.to, (busy.get(r.to) ?? 0) + r.count);
	}
	const order = [...busy.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([code]) => code);
	const kept = new Set(order.slice(0, top));
	const bucket = (code: string) => (kept.has(code) ? code : OTHER);
	const rank = new Map([...order.slice(0, top), OTHER].map((c, i) => [c, i]));
	const byRank = (a: string, b: string) =>
		(rank.get(a) ?? 0) - (rank.get(b) ?? 0);

	// Merge routes that fall into "Other" on either side.
	const merged = new Map<string, { from: string; to: string; count: number }>();
	for (const r of routes) {
		const from = bucket(r.from);
		const to = bucket(r.to);
		const key = `${from}>${to}`;
		const link = merged.get(key);
		if (link) link.count += r.count;
		else merged.set(key, { from, to, count: r.count });
	}
	const links = [...merged.values()];
	const total = links.reduce((s, l) => s + l.count, 0);

	const sideCounts = (side: "from" | "to") => {
		const counts = new Map<string, number>();
		for (const l of links)
			counts.set(l[side], (counts.get(l[side]) ?? 0) + l.count);
		return [...counts.entries()].sort((a, b) => byRank(a[0], b[0]));
	};
	const left = sideCounts("from");
	const right = sideCounts("to");
	const rows = Math.max(left.length, right.length);
	const target = Math.min(Math.max(rows * 42, 220), 620);
	const scale = total > 0 ? (target - 2 * PAD - GAP * (rows - 1)) / total : 0;
	// A tiny node still takes a label's room, so labels never overlap.
	const slot = (count: number) => Math.max(count * scale, MIN_SLOT) + GAP;
	const used = (entries: [string, number][]) =>
		entries.reduce((s, [, n]) => s + slot(n), -GAP);
	const height = Math.ceil(
		Math.max(target, used(left) + 2 * PAD, used(right) + 2 * PAD),
	);

	const xLeft = LABEL;
	const xRight = Math.max(width - LABEL - NODE_W, xLeft + NODE_W + 80);
	const place = (
		entries: [string, number][],
		side: "from" | "to",
		x: number,
	): SankeyNode[] => {
		// Centre the shorter column.
		let y = (height - used(entries)) / 2;
		return entries.map(([code, count]) => {
			const node = { code, side, count, x, y, h: count * scale };
			y += slot(count);
			return node;
		});
	};
	const fromNodes = place(left, "from", xLeft);
	const toNodes = place(right, "to", xRight);

	// Stack bands inside each node in the order of the other side, so they do not cross at the node.
	const outY = new Map(fromNodes.map((n) => [n.code, n.y]));
	const inY = new Map(toNodes.map((n) => [n.code, n.y]));
	const x1 = xLeft + NODE_W;
	const x2 = xRight;
	const xm = (x1 + x2) / 2;
	const sorted = [...links].sort(
		(a, b) => byRank(a.from, b.from) || byRank(a.to, b.to),
	);
	const placed = new Map<SankeyLink, number>();
	const result: SankeyLink[] = sorted.map((l) => {
		const w = l.count * scale;
		const a = outY.get(l.from) ?? 0;
		outY.set(l.from, a + w);
		const link: SankeyLink = { ...l, band: "", line: "", width: w };
		placed.set(link, a);
		return link;
	});
	for (const link of [...result].sort(
		(a, b) => byRank(a.to, b.to) || byRank(a.from, b.from),
	)) {
		const b = inY.get(link.to) ?? 0;
		inY.set(link.to, b + link.width);
		const a = placed.get(link) ?? 0;
		const w = link.width;
		const f = (n: number) => n.toFixed(1);
		link.band =
			`M${f(x1)} ${f(a)}C${f(xm)} ${f(a)} ${f(xm)} ${f(b)} ${f(x2)} ${f(b)}` +
			`L${f(x2)} ${f(b + w)}C${f(xm)} ${f(b + w)} ${f(xm)} ${f(a + w)} ${f(x1)} ${f(a + w)}Z`;
		const ca = a + w / 2;
		const cb = b + w / 2;
		link.line = `M${f(x1)} ${f(ca)}C${f(xm)} ${f(ca)} ${f(xm)} ${f(cb)} ${f(x2)} ${f(cb)}`;
	}
	// Thickest bands first, so thin ones stay on top and can be hovered.
	result.sort((a, b) => b.count - a.count);
	return { width, height, nodes: [...fromNodes, ...toNodes], links: result };
}
