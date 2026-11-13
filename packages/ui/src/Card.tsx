import type { ReactNode } from "react";

export function Card({
	title,
	description,
	actions,
	art,
	variant = "default",
	className,
	children,
}: {
	title?: ReactNode;
	/** Muted line under the title. */
	description?: ReactNode;
	/** Buttons on the right of the title. */
	actions?: ReactNode;
	/** Decoration left of the title, e.g. a `PixelArt`. */
	art?: ReactNode;
	/** selected: green border; highlight: green border, glow and a tinted fill. */
	variant?: "default" | "selected" | "highlight";
	className?: string;
	children: ReactNode;
}) {
	const header =
		description || actions || art ? (
			<div className="vp-card-header">
				{art ? (
					<div className="vp-card-art" aria-hidden="true">
						{art}
					</div>
				) : null}
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
		<section
			className={["vp-card", className].filter(Boolean).join(" ")}
			data-variant={variant === "default" ? undefined : variant}
		>
			{header}
			{children}
		</section>
	);
}
