import type { ReactNode } from "react";

export function Card({
	title,
	description,
	actions,
	className,
	children,
}: {
	title?: ReactNode;
	/** Muted line under the title. */
	description?: ReactNode;
	/** Buttons on the right of the title. */
	actions?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const header =
		description || actions ? (
			<div className="vp-card-header">
				<div className="vp-card-heading">
					{title ? <h2 className="vp-card-title">{title}</h2> : null}
					{description ? (
						<p className="vp-card-description">{description}</p>
					) : null}
				</div>
				{actions ? <div className="vp-card-actions">{actions}</div> : null}
			</div>
		) : title ? (
			<h2 className="vp-card-title">{title}</h2>
		) : null;
	return (
		<section className={["vp-card", className].filter(Boolean).join(" ")}>
			{header}
			{children}
		</section>
	);
}
