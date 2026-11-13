import type { ReactNode } from "react";

/** What a section shows before there is anything in it, with the next step to take. */
export function EmptyState({
	icon,
	art,
	title,
	children,
	action,
}: {
	/** A small icon in a round badge. */
	icon?: ReactNode;
	/** A larger illustration, e.g. a `PixelArt`, shown instead of the icon. */
	art?: ReactNode;
	title: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="vp-empty">
			{art ? (
				<span className="vp-empty-art" aria-hidden="true">
					{art}
				</span>
			) : icon ? (
				<span className="vp-empty-icon" aria-hidden="true">
					{icon}
				</span>
			) : null}
			<p className="vp-empty-title">{title}</p>
			{children ? <div className="vp-empty-body">{children}</div> : null}
			{action ? <div className="vp-empty-action">{action}</div> : null}
		</div>
	);
}
