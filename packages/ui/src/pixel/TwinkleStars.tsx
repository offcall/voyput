import { useMemo } from "react";
import { PixelArt } from "./PixelArt";

/** Small deterministic PRNG, so the stars sit in the same places on every render. */
function random(seed: number) {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

/**
 * Decorative twinkling stars filling the nearest positioned ancestor.
 * Colour is `--vp-twinkle`; the twinkle stops under `prefers-reduced-motion`.
 */
export function TwinkleStars({
	count = 18,
	seed = 7,
}: {
	count?: number;
	seed?: number;
}) {
	const stars = useMemo(() => {
		const next = random(seed);
		return Array.from({ length: count }, () => ({
			left: next() * 100,
			top: next() * 100,
			big: next() < 0.3,
			delay: next() * 4,
		}));
	}, [count, seed]);
	return (
		<div className="vp-twinkle" aria-hidden="true">
			{stars.map((star) => (
				<span
					key={`${star.left}-${star.top}`}
					className="vp-twinkle-star"
					style={{
						left: `${star.left}%`,
						top: `${star.top}%`,
						animationDelay: `${star.delay}s`,
					}}
				>
					{star.big ? (
						<PixelArt name="sparkle" scale={2} />
					) : (
						<span className="vp-twinkle-dot" />
					)}
				</span>
			))}
		</div>
	);
}
