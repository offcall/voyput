import { PixelArt, type SpriteName } from "@voyput/ui";
import type { ReactNode } from "react";

/** One tab's chart in a card under a pixel title. */
export function ChartPanel({
	title,
	sprite,
	description,
	children,
}: {
	title: string;
	sprite: SpriteName;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="vp-viz-panel">
			<header className="vp-viz-panel-header">
				<PixelArt name={sprite} scale={2} />
				<div>
					<h2>{title}</h2>
					<p>{description}</p>
				</div>
			</header>
			{children}
		</section>
	);
}
