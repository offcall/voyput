import type { ReactNode } from "react";
import { PixelArt } from "./PixelArt";
import { PixelSky } from "./PixelSky";
import type { SpriteName } from "./sprites";

/**
 * Top of a page on a short pixel sky: the page's h1 and a sprite on the band,
 * a muted description and actions under it.
 */
export function SkyHeader({
	title,
	art,
	description,
	actions,
}: {
	title: ReactNode;
	/** The sprite on the sky, e.g. a plane for Journey. */
	art: SpriteName;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header className="vp-sky-header">
			<PixelSky variant="band" height={56}>
				<div className="vp-sky-band">
					<h1>{title}</h1>
					<PixelArt name={art} scale={3} className="vp-sky-band-art" />
				</div>
			</PixelSky>
			{description || actions ? (
				<div className="vp-sky-header-body">
					{description ? (
						<p className="vp-page-description">{description}</p>
					) : null}
					{actions ? <div className="vp-page-actions">{actions}</div> : null}
				</div>
			) : null}
		</header>
	);
}
