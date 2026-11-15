/**
 * Puts the stamps on passport pages in date order, as a border officer would:
 * on the next free spot, a bit crooked, sometimes over an older stamp, but
 * never off the page.
 */

import { type Placed, stampSize } from "./draw.ts";
import { random } from "./locations.ts";
import { PAGE_HEIGHT, PAGE_WIDTH, POSTS, type StampPlan } from "./scenario.ts";

/** Usable area: inside the frame, below the header, above the page number. */
const AREA = {
	left: 52,
	right: PAGE_WIDTH - 52,
	top: 128,
	bottom: PAGE_HEIGHT - 112,
};
/** Stamps per page, in date order: some officers leave more room than others. */
const PER_PAGE = [7, 8, 6, 8, 7, 8, 7, 8, 8, 7];

interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

function box(stamp: StampPlan, x: number, y: number, rotate: number): Box {
	const { w, h } = stampSize(stamp);
	const a = (rotate * Math.PI) / 180;
	const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
	const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
	return { x0: x - bw / 2, y0: y - bh / 2, x1: x + bw / 2, y1: y + bh / 2 };
}

const overlap = (a: Box, b: Box) =>
	Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
	Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Splits the stamps into pages in date order. */
export function paginate(stamps: StampPlan[]): StampPlan[][] {
	const total = PER_PAGE.reduce((sum, n) => sum + n, 0);
	if (total !== stamps.length)
		throw new Error(
			`PER_PAGE holds ${total} stamps, the trips ${stamps.length}`,
		);
	return PER_PAGE.map((n, i) => {
		const start = PER_PAGE.slice(0, i).reduce((sum, m) => sum + m, 0);
		return stamps.slice(start, start + n);
	});
}

function rotation(rand: () => number, sticker: boolean): number {
	const r = rand();
	// A visa sticker goes on straight; a rubber stamp lands any way up.
	if (sticker) return (r - 0.5) * 4;
	if (r < 0.06) return 90 + (rand() - 0.5) * 6;
	if (r < 0.1) return -90 + (rand() - 0.5) * 6;
	if (r < 0.25) return (rand() - 0.5) * 36;
	return (rand() - 0.5) * 12;
}

/** Places one page's stamps; earlier stamps take the better spots. */
export function layout(stamps: StampPlan[], page: number): Placed[] {
	const rand = random(4049 + page * 131);
	const placed: (Placed & { box: Box })[] = [];
	for (const stamp of stamps) {
		const { w, h } = stampSize(stamp);
		const sticker =
			POSTS[stamp.post].country === "JP" && stamp.direction === "entry";
		// Now and then an officer stamps over the edge of an older stamp.
		const crowd = placed.length > 0 && rand() < 0.25 ? w * h * 0.1 : 0;
		let best: (Placed & { box: Box; cost: number }) | null = null;
		for (let tries = 0; tries < 600; tries++) {
			const rotate = rotation(rand, sticker);
			const x = AREA.left + rand() * (AREA.right - AREA.left);
			const y = AREA.top + rand() * (AREA.bottom - AREA.top);
			const b = box(stamp, x, y, rotate);
			if (
				b.x0 < AREA.left ||
				b.x1 > AREA.right ||
				b.y0 < AREA.top ||
				b.y1 > AREA.bottom
			)
				continue;
			const covered = placed.reduce((sum, p) => sum + overlap(b, p.box), 0);
			// Keep clear of the others, but not packed: any free spot will do.
			const cost = Math.abs(covered - crowd) + rand() * 2000;
			if (!best || cost < best.cost)
				best = {
					stamp,
					x,
					y,
					rotate,
					seed: rand(),
					partial: rand() < 0.3 ? 0.25 + rand() * 0.25 : null,
					box: b,
					cost,
				};
		}
		if (!best) throw new Error(`No room for ${stamp.post} ${stamp.date}`);
		placed.push(best);
	}
	return placed.map(({ stamp, x, y, rotate, seed, partial }) => ({
		stamp,
		x: Math.round(x),
		y: Math.round(y),
		rotate: Math.round(rotate * 10) / 10,
		seed,
		partial,
	}));
}
