import type { ReactNode } from "react";

/** What a section shows before there is anything in it, with the next step to take. */
export function EmptyState({
	icon,
	title,
	children,
	action,
}: {
	icon?: ReactNode;
	title: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="vp-empty">
			{icon ? (
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
