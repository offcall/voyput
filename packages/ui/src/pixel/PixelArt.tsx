import { PALETTE, SPRITES, type SpriteName, spritePaths } from "./sprites";

const cache = new Map<SpriteName, ReturnType<typeof spritePaths>>();

function pathsOf(name: SpriteName) {
	let paths = cache.get(name);
	if (!paths) {
		paths = spritePaths(SPRITES[name]);
		cache.set(name, paths);
	}
	return paths;
}

/**
 * One of the kit's pixel sprites as crisp SVG, `scale` screen pixels per art pixel.
 * Decorative unless it gets a `title`.
 */
export function PixelArt({
	name,
	scale = 4,
	title,
	className,
}: {
	name: SpriteName;
	scale?: number;
	title?: string;
	className?: string;
}) {
	const rows = SPRITES[name];
	const width = rows[0]?.length ?? 0;
	const height = rows.length;
	return (
		<svg
			className={["vp-pixel-art", className].filter(Boolean).join(" ")}
			width={width * scale}
			height={height * scale}
			viewBox={`0 0 ${width} ${height}`}
			shapeRendering="crispEdges"
			role="img"
			aria-label={title}
			aria-hidden={title ? undefined : true}
		>
			{pathsOf(name).map((path) => (
				<path key={path.key} d={path.d} style={{ fill: PALETTE[path.key] }} />
			))}
		</svg>
	);
}
