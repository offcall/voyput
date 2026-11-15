import { PixelArt, type SpriteName } from "@voyput/ui";
import type { ReactNode } from "react";

/** One chart in a card under a short title; the sprite is optional decoration. */
export function ChartPanel({
	title,
	sprite,
	description,
	children,
}: {
	title: string;
	sprite?: SpriteName;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section className="vp-viz-panel">
			<header className="vp-viz-panel-header">
				{sprite ? <PixelArt name={sprite} scale={2} /> : null}
				<div>
					<h2>{title}</h2>
					{description ? <p>{description}</p> : null}
				</div>
			</header>
			{children}
		</section>
	);
}
