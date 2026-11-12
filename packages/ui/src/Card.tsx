import type { ReactNode } from "react";

export function Card({
	title,
	children,
}: {
	title?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="vp-card">
			{title ? <h2 className="vp-card-title">{title}</h2> : null}
			{children}
		</section>
	);
}
