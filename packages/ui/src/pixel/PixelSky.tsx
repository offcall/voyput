import type { CSSProperties, ReactNode } from "react";
import { PALETTE, SPRITES, spritePaths } from "./sprites";

/** Banded sky, top to bottom, as shares of `--vp-sky-top`. */
const BANDS = [100, 80, 60, 40, 20, 0];

/** Column heights of a hill layer, stepped every 2 pixels. */
function hillPath(
	width: number,
	height: number,
	base: number,
	waves: [number, number][],
) {
	let d = "";
	for (let x = 0; x < width; x += 2) {
		const lift = waves.reduce(
			(sum, [amp, period]) => sum + amp * Math.sin(x / period),
			0,
		);
		const top = Math.round(height - base - lift);
		d += `M${x} ${top}h2V${height}h-2z`;
	}
	return d;
}

interface SkyArt {
	/** Art box in pixels; the SVG fills the sky's width and keeps the hills at the bottom. */
	width: number;
	height: number;
	stars: [number, number][];
	clouds: { x: number; y: number; slow?: boolean }[];
	sun: [number, number];
	farHills: string;
	nearHills: string;
}

const BANNER_STARS: [number, number][] = [
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

/** A tall banner: one 320 × 48 scene, scaled to the width. */
const BANNER: SkyArt = {
	width: 320,
	height: 48,
	stars: BANNER_STARS,
	clouds: [
		{ x: 22, y: 9 },
		{ x: 104, y: 16, slow: true },
		{ x: 158, y: 6 },
		{ x: 262, y: 14, slow: true },
	],
	sun: [206, 5],
	farHills: hillPath(320, 48, 12, [
		[5, 23],
		[2, 7],
	]),
	nearHills: hillPath(320, 48, 6, [
		[3, 17],
		[1, 5],
	]),
};

/**
 * A short band behind a title: a wide 640 × 32 scene with low hills, so a band
 * about 56px high keeps the same chunky pixels as the banner and still shows sky.
 * Narrow screens see its middle, where the sun is.
 */
const BAND: SkyArt = {
	width: 640,
	height: 32,
	stars: [
		...BANNER_STARS,
		...BANNER_STARS.map(([x, y]): [number, number] => [x + 320, (y + 5) % 16]),
	],
	clouds: [
		{ x: 40, y: 5 },
		{ x: 150, y: 10, slow: true },
		{ x: 268, y: 3 },
		{ x: 452, y: 8, slow: true },
		{ x: 560, y: 4 },
	],
	sun: [356, 3],
	farHills: hillPath(640, 32, 5, [
		[3, 23],
		[1, 7],
	]),
	nearHills: hillPath(640, 32, 2, [
		[2, 17],
		[1, 5],
	]),
};

const cloud = spritePaths(SPRITES.cloud);
const sun = spritePaths(SPRITES.sun);

/**
 * A pixel landscape banner: banded sky, clouds, sun or moon, stars and hills.
 * It follows the theme (day sky in light, night in dark) unless `time` forces one.
 * Children sit on top, e.g. a title. On phones a band is at most 48px tall.
 */
export function PixelSky({
	time = "auto",
	height = 160,
	variant = "banner",
	children,
}: {
	time?: "auto" | "day" | "night";
	height?: number;
	/** `band`: a low, wide scene for a short strip behind a title. */
	variant?: "banner" | "band";
	children?: ReactNode;
}) {
	const art = variant === "band" ? BAND : BANNER;
	const W = art.width;
	const H = art.height;
	return (
		<div
			className="vp-sky"
			data-variant={variant}
			data-time={time === "auto" ? undefined : time}
			style={{ "--vp-sky-h": `${height}px` } as CSSProperties}
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
					{art.stars.map(([x, y], index) => (
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
				<g transform={`translate(${art.sun[0]} ${art.sun[1]})`}>
					{sun.map((path) => (
						<path
							key={path.key}
							d={path.d}
							style={{ fill: PALETTE[path.key] }}
						/>
					))}
				</g>
				{art.clouds.map((c) => (
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
				<path d={art.farHills} style={{ fill: "var(--vp-hill-far)" }} />
				<path d={art.nearHills} style={{ fill: "var(--vp-hill)" }} />
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
