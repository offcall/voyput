import type { VizData } from "@voyput/core";
import { CountryChip, Tabs } from "@voyput/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCountryColour } from "../../../app/countryColours";
import { formatInt, NoData, OTHER_COLOR } from "./format";
import {
	layoutSankey,
	moveYears,
	NODE_W,
	OTHER,
	type Route,
	routesOf,
	type SankeyLink,
} from "./moves";
import { type MarkProps, useMarkTip } from "./useMarkTip";
import "./moves.css";

/** Width of the element in CSS pixels; `fallback` where ResizeObserver is missing (jsdom). */
function useWidth(fallback: number) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(fallback);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			const w = entry?.contentRect.width;
			if (w) setWidth(Math.round(w));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return { ref, width };
}

/** A tip mark that also reports hover and focus. */
function hovering(
	props: MarkProps,
	enter: () => void,
	leave: () => void,
): MarkProps {
	return {
		...props,
		onPointerEnter: (event) => {
			props.onPointerEnter(event);
			enter();
		},
		onPointerLeave: () => {
			props.onPointerLeave();
			leave();
		},
		onFocus: (event) => {
			props.onFocus(event);
			enter();
		},
		onBlur: () => {
			props.onBlur();
			leave();
		},
	};
}

const plural = (n: number, word: string) =>
	`${formatInt(n)} ${word}${n === 1 ? "" : "s"}`;

/** Country-to-country moves as a Sankey with moving dots, a year filter and a table. */
export function SankeyChart({ data }: { data: VizData }) {
	const years = useMemo(() => moveYears(data.moves), [data.moves]);
	const [picked, setPicked] = useState<string | null>(null);
	// A trip filter change can drop the picked year.
	const year = picked !== null && years.includes(picked) ? picked : null;
	const routes = useMemo(() => routesOf(data.moves, year), [data.moves, year]);
	if (data.moves.length === 0) return <NoData />;

	const moves = routes.reduce((s, r) => s + r.count, 0);
	const countries = new Set(routes.flatMap((r) => [r.from, r.to])).size;
	const busiest = routes[0];
	return (
		<figure className="vp-viz-figure vp-moves">
			<div className="vp-moves-head">
				<dl className="vp-moves-stats">
					<div>
						<dt>Moves</dt>
						<dd>{formatInt(moves)}</dd>
					</div>
					<div>
						<dt>Routes</dt>
						<dd>{formatInt(routes.length)}</dd>
					</div>
					<div>
						<dt>Countries</dt>
						<dd>{formatInt(countries)}</dd>
					</div>
					{busiest && busiest.count > 1 ? (
						<div>
							<dt>Busiest</dt>
							<dd>
								{busiest.from} → {busiest.to}{" "}
								<span className="vp-moves-times">×{busiest.count}</span>
							</dd>
						</div>
					) : null}
				</dl>
				{years.length > 1 ? (
					// biome-ignore lint/a11y/useSemanticElements: a row of toggle buttons, not a form fieldset.
					<div className="vp-moves-years" role="group" aria-label="Year">
						{[null, ...years].map((y) => (
							<button
								key={y ?? "all"}
								type="button"
								className="vp-moves-year"
								aria-pressed={year === y}
								onClick={() => setPicked(y)}
							>
								{y ?? "All"}
							</button>
						))}
					</div>
				) : null}
			</div>
			<Tabs
				items={[
					{
						value: "flows",
						label: "Flows",
						content: <MovesFlows routes={routes} />,
					},
					{
						value: "table",
						label: "Table",
						content: <RoutesTable routes={routes} />,
					},
				]}
			/>
		</figure>
	);
}

/** Which country or route the pointer or keyboard is on. */
type Active =
	| { kind: "country"; code: string }
	| { kind: "route"; from: string; to: string };

function MovesFlows({ routes }: { routes: readonly Route[] }) {
	const countryColor = useCountryColour();
	const { hostRef, mark, tip } = useMarkTip<HTMLDivElement>();
	const { ref, width } = useWidth(900);
	const [hover, setHover] = useState<Active | null>(null);
	const layout = useMemo(
		() => layoutSankey(routes, Math.max(width, 300), width < 560 ? 7 : 10),
		[routes, width],
	);
	const names = useMemo(() => {
		const map = new Map<string, string>([[OTHER, "Other"]]);
		for (const r of routes) {
			map.set(r.from, r.fromName);
			map.set(r.to, r.toName);
		}
		return map;
	}, [routes]);
	const name = (code: string) => names.get(code) ?? code;
	const color = (code: string) =>
		code === OTHER ? OTHER_COLOR : countryColor(code);
	const active = hover;
	const lit = (link: SankeyLink) =>
		!active ||
		(active.kind === "country"
			? link.from === active.code || link.to === active.code
			: link.from === active.from && link.to === active.to);
	const litNode = (code: string) =>
		!active ||
		(active.kind === "country"
			? code === active.code
			: code === active.from || code === active.to);

	const out = new Map<string, number>();
	const into = new Map<string, number>();
	for (const n of layout.nodes)
		(n.side === "from" ? out : into).set(n.code, n.count);
	const focusText = (() => {
		if (!active)
			return "Hover or tap a country to follow its moves; the dots run in the direction of travel.";
		if (active.kind === "route") {
			const link = layout.links.find(
				(l) => l.from === active.from && l.to === active.to,
			);
			return `${name(active.from)} → ${name(active.to)}: ${plural(link?.count ?? 0, "move")}.`;
		}
		const code = active.code;
		const top = (side: "from" | "to") =>
			layout.links
				.filter((l) => l[side] === code)
				.sort((a, b) => b.count - a.count)[0];
		const toTop = top("from");
		const fromTop = top("to");
		return [
			`${name(code)}: ${formatInt(out.get(code) ?? 0)} out, ${formatInt(into.get(code) ?? 0)} in.`,
			toTop ? `Most often on to ${name(toTop.to)}.` : "",
			fromTop ? `Most often in from ${name(fromTop.from)}.` : "",
		]
			.filter(Boolean)
			.join(" ");
	})();

	const leave = () => setHover(null);
	return (
		<div className="vp-moves-flows" ref={ref}>
			<p className="vp-moves-sides vp-viz-muted" aria-hidden="true">
				<span>Left from</span>
				<span>Went to</span>
			</p>
			<div className="vp-viz-tipped" ref={hostRef}>
				{/* biome-ignore lint/a11y/useSemanticElements: an SVG chart with focusable marks cannot be a fieldset. */}
				<svg
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					width={layout.width}
					height={layout.height}
					role="group"
					aria-label="Moves between countries"
					className="vp-moves-svg"
					data-active={active ? "" : undefined}
				>
					<defs>
						{layout.links.map((l) => (
							<linearGradient
								key={l.from + l.to}
								id={`vp-moves-${l.from}-${l.to}`}
								gradientUnits="userSpaceOnUse"
								x1={NODE_W + 76}
								x2={layout.width - NODE_W - 76}
							>
								<stop offset="0" style={{ stopColor: color(l.from) }} />
								<stop offset="1" style={{ stopColor: color(l.to) }} />
							</linearGradient>
						))}
					</defs>
					<g>
						{layout.links.map((l) => (
							<path
								key={l.from + l.to}
								d={l.band}
								className="vp-moves-band"
								data-lit={lit(l) ? "" : undefined}
								fill={`url(#vp-moves-${l.from}-${l.to})`}
								{...hovering(
									mark(`route-${l.from}-${l.to}`, {
										label: `${name(l.from)} → ${name(l.to)}`,
										value: plural(l.count, "move"),
									}),
									() => setHover({ kind: "route", from: l.from, to: l.to }),
									leave,
								)}
							/>
						))}
					</g>
					<g className="vp-moves-dots">
						{layout.links.map((l) =>
							lit(l) ? (
								<path
									key={l.from + l.to}
									d={l.line}
									style={{
										stroke: color(l.to),
										strokeWidth: Math.min(Math.max(l.width * 0.45, 2), 5),
									}}
								/>
							) : null,
						)}
					</g>
					{layout.nodes.map((n) => {
						const left = n.side === "from";
						return (
							<g
								key={`${n.side}-${n.code}`}
								className="vp-moves-node"
								data-lit={litNode(n.code) ? "" : undefined}
							>
								<rect
									x={n.x}
									y={n.y}
									width={NODE_W}
									height={Math.max(n.h, 2)}
									style={{ fill: color(n.code) }}
									{...hovering(
										mark(`${n.side}-${n.code}`, {
											label: `${left ? "From" : "To"} ${name(n.code)}`,
											value: plural(n.count, "move"),
										}),
										() => setHover({ kind: "country", code: n.code }),
										leave,
									)}
								/>
								<text
									x={left ? n.x - 8 : n.x + NODE_W + 8}
									y={n.y + n.h / 2}
									textAnchor={left ? "end" : "start"}
									dominantBaseline="central"
									className="vp-moves-label"
								>
									{left ? (
										<>
											<tspan className="vp-moves-count">{n.count} </tspan>
											{n.code === OTHER ? "Other" : n.code}
										</>
									) : (
										<>
											{n.code === OTHER ? "Other" : n.code}
											<tspan className="vp-moves-count"> {n.count}</tspan>
										</>
									)}
								</text>
							</g>
						);
					})}
				</svg>
				{tip}
			</div>
			<p className="vp-moves-focus vp-viz-muted" aria-live="polite">
				{focusText}
			</p>
		</div>
	);
}

/** Every route with its count, last move and a bar. */
function RoutesTable({ routes }: { routes: readonly Route[] }) {
	const countryColor = useCountryColour();
	const max = routes[0]?.count ?? 1;
	return (
		<div className="vp-viz-scroll">
			<table className="vp-viz-table vp-moves-table">
				<caption className="vp-viz-muted">
					{plural(routes.length, "route")} · a move is a day the country changed
				</caption>
				<thead>
					<tr>
						<th scope="col">From</th>
						<th scope="col">To</th>
						<th scope="col">Moves</th>
						<th scope="col">Last</th>
					</tr>
				</thead>
				<tbody>
					{routes.map((r) => (
						<tr key={`${r.from}-${r.to}`}>
							<td>
								<CountryChip
									code={r.from}
									name={r.fromName}
									colour={countryColor(r.from)}
								/>
							</td>
							<td>
								<CountryChip
									code={r.to}
									name={r.toName}
									colour={countryColor(r.to)}
								/>
							</td>
							<td>
								<span className="vp-moves-bar-cell">
									<b className="vp-moves-num">{r.count}</b>
									<span className="vp-moves-bar" aria-hidden="true">
										<span
											style={{
												width: `${Math.max(4, (r.count / max) * 100)}%`,
												background: countryColor(r.to),
											}}
										/>
									</span>
								</span>
							</td>
							<td>{r.last}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
