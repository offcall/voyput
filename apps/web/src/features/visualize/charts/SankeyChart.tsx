import type { VizData } from "@voyput/core";
import { useCountryColour } from "../../../app/countryColours";
import { flag, NoData, OTHER_COLOR } from "./format";

const TOP = 12;
const OTHER = "OTHER";
const HEIGHT = 560;
const GAP = 12;
const NODE_W = 140;
const LEFT_X = 40;
const RIGHT_X = 820;

interface Node {
	code: string;
	flow: number;
	y: number;
	h: number;
}

function layout(entries: { code: string; flow: number }[]): Map<string, Node> {
	const sum = entries.reduce((s, n) => s + n.flow, 0);
	const scale = sum > 0 ? (HEIGHT - GAP * (entries.length - 1)) / sum : 0;
	const nodes = new Map<string, Node>();
	let y = 20;
	for (const entry of entries) {
		const h = Math.max(10, entry.flow * scale);
		nodes.set(entry.code, { ...entry, y, h });
		y += h + GAP;
	}
	return nodes;
}

/** Country-to-country moves: where you left from (left) and where you went (right). */
export function SankeyChart({ data }: { data: VizData }) {
	const countryColor = useCountryColour();
	const transitions = data.transitions;
	if (transitions.length === 0) return <NoData />;
	const names = new Map(data.countries.map((c) => [c.code, c.country]));
	const name = (code: string) =>
		code === OTHER ? "Other" : (names.get(code) ?? code);
	const color = (code: string) =>
		code === OTHER ? OTHER_COLOR : countryColor(code);

	const total = new Map<string, number>();
	const out = new Map<string, number>();
	const into = new Map<string, number>();
	const add = (map: Map<string, number>, key: string, n: number) =>
		map.set(key, (map.get(key) ?? 0) + n);
	for (const t of transitions) {
		add(total, t.from, t.count);
		add(total, t.to, t.count);
		add(out, t.from, t.count);
		add(into, t.to, t.count);
	}
	const top = new Set(
		[...total.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, TOP)
			.map(([code]) => code),
	);
	const bucket = (code: string) => (top.has(code) ? code : OTHER);
	const column = (flows: Map<string, number>) => {
		const merged = new Map<string, number>();
		for (const [code, flow] of flows) add(merged, bucket(code), flow);
		const order = [...top, OTHER];
		return order.flatMap((code) => {
			const flow = merged.get(code) ?? 0;
			return flow > 0 ? [{ code, flow }] : [];
		});
	};
	const left = layout(column(out));
	const right = layout(column(into));
	const maxCount = Math.max(...transitions.map((t) => t.count));

	return (
		<figure className="vp-viz-figure">
			<svg
				viewBox="0 0 1000 600"
				role="img"
				aria-label="Moves between countries"
				className="vp-viz-svg"
			>
				<g fill="none" opacity={0.45}>
					{transitions.map((t) => {
						const a = left.get(bucket(t.from));
						const b = right.get(bucket(t.to));
						if (!a || !b) return null;
						const y1 = a.y + a.h / 2;
						const y2 = b.y + b.h / 2;
						const x1 = LEFT_X + NODE_W;
						return (
							<path
								key={`${t.from}-${t.to}`}
								d={`M ${x1},${y1} C 480,${y1} 520,${y2} ${RIGHT_X},${y2}`}
								style={{ stroke: color(t.to) }}
								strokeWidth={Math.max(1, (t.count * 14) / maxCount)}
							>
								<title>{`${name(t.from)} → ${name(t.to)} · ${t.count}×`}</title>
							</path>
						);
					})}
				</g>
				{[
					{ nodes: left, x: LEFT_X, side: "left" as const },
					{ nodes: right, x: RIGHT_X, side: "right" as const },
				].flatMap(({ nodes, x, side }) =>
					[...nodes.values()].map((n) => (
						<g key={`${side}-${n.code}`}>
							<rect
								x={x}
								y={n.y}
								width={NODE_W}
								height={n.h}
								rx={3}
								style={{ fill: color(n.code) }}
							/>
							<text
								x={side === "left" ? x - 8 : x + NODE_W + 8}
								y={n.y + n.h / 2}
								textAnchor={side === "left" ? "end" : "start"}
								dominantBaseline="central"
								className="vp-viz-sankey-label"
							>
								{n.code === OTHER ? "Other" : flag(n.code)}
								<title>{name(n.code)}</title>
							</text>
						</g>
					)),
				)}
			</svg>
			<figcaption className="vp-viz-muted">
				Moves on days the country changed
			</figcaption>
		</figure>
	);
}
