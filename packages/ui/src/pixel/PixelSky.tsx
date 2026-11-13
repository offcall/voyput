import type { ReactNode } from "react";
import { PALETTE, SPRITES, spritePaths } from "./sprites";

/** Art box in pixels; the SVG fills the banner's width and keeps the hills at the bottom. */
const W = 320;
const H = 48;

/** Banded sky, top to bottom, as shares of `--vp-sky-top`. */
const BANDS = [100, 80, 60, 40, 20, 0];

/** Column heights of a hill layer, stepped every 2 pixels. */
function hillPath(base: number, waves: [number, number][]) {
	let d = "";
	for (let x = 0; x < W; x += 2) {
		const lift = waves.reduce(
			(sum, [amp, period]) => sum + amp * Math.sin(x / period),
			0,
		);
		const top = Math.round(H - base - lift);
		d += `M${x} ${top}h2V${H}h-2z`;
	}
	return d;
}

const FAR_HILLS = hillPath(12, [
	[5, 23],
	[2, 7],
]);
const NEAR_HILLS = hillPath(6, [
	[3, 17],
	[1, 5],
]);

const STARS: [number, number][] = [
	[14, 4],
	[38, 11],
	[62, 3],
	[91, 9],
	[117, 5],
	[143, 13],
	[171, 2],
	[226, 10],
	[251, 4],
	[279, 12],
	[303, 6],
];

const CLOUDS: { x: number; y: number; slow?: boolean }[] = [
	{ x: 22, y: 9 },
	{ x: 104, y: 16, slow: true },
	{ x: 158, y: 6 },
	{ x: 262, y: 14, slow: true },
];

const cloud = spritePaths(SPRITES.cloud);
const sun = spritePaths(SPRITES.sun);

/**
 * A pixel landscape banner: banded sky, clouds, sun or moon, stars and hills.
 * It follows the theme (day sky in light, night in dark) unless `time` forces one.
 * Children sit on top, e.g. a title.
 */
export function PixelSky({
	time = "auto",
	height = 160,
	children,
}: {
	time?: "auto" | "day" | "night";
	height?: number;
	children?: ReactNode;
}) {
	return (
		<div
			className="vp-sky"
			data-time={time === "auto" ? undefined : time}
			style={{ height }}
		>
			<svg
				className="vp-sky-art"
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="xMidYMax slice"
				shapeRendering="crispEdges"
				aria-hidden="true"
			>
				{BANDS.map((share, index) => (
					<rect
						key={share}
						x={0}
						y={(index * H) / BANDS.length}
						width={W}
						height={H / BANDS.length + 1}
						style={{
							fill: `color-mix(in srgb, var(--vp-sky-top) ${share}%, var(--vp-sky-bottom))`,
						}}
					/>
				))}
				<g className="vp-sky-stars" style={{ fill: "var(--vp-star)" }}>
					{STARS.map(([x, y], index) => (
						<rect
							key={`${x}-${y}`}
							x={x}
							y={y}
							width={1}
							height={1}
							style={{ animationDelay: `${(index % 5) * 0.7}s` }}
						/>
					))}
				</g>
				<g transform="translate(206 5)">
					{sun.map((path) => (
						<path
							key={path.key}
							d={path.d}
							style={{ fill: PALETTE[path.key] }}
						/>
					))}
				</g>
				{CLOUDS.map((c) => (
					<g
						key={c.x}
						transform={`translate(${c.x} ${c.y})`}
						className="vp-sky-cloud"
						data-slow={c.slow ? "" : undefined}
					>
						{cloud.map((path) => (
							<path
								key={path.key}
								d={path.d}
								style={{ fill: PALETTE[path.key] }}
							/>
						))}
					</g>
				))}
				<path d={FAR_HILLS} style={{ fill: "var(--vp-hill-far)" }} />
				<path d={NEAR_HILLS} style={{ fill: "var(--vp-hill)" }} />
				<rect
					x={0}
					y={H - 2}
					width={W}
					height={2}
					style={{ fill: "var(--vp-hill-shade)" }}
				/>
			</svg>
			{children ? <div className="vp-sky-content">{children}</div> : null}
		</div>
	);
}
