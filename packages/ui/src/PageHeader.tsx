import type { ReactNode } from "react";

/** Top of a page: the page's h1, a muted description and actions on the right. */
export function PageHeader({
	title,
	eyebrow,
	description,
	actions,
}: {
	title: ReactNode;
	/** Small uppercase line above the title, e.g. the workflow step. */
	eyebrow?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header className="vp-page-header">
			<div className="vp-page-header-text">
				{eyebrow ? <p className="vp-page-eyebrow">{eyebrow}</p> : null}
				<h1>{title}</h1>
				{description ? (
					<p className="vp-page-description">{description}</p>
				) : null}
			</div>
			{actions ? <div className="vp-page-actions">{actions}</div> : null}
		</header>
	);
}
