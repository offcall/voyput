import type { ReactNode } from "react";

/** A collapsible block for help text, built on <details>. */
export function Disclosure({
	summary,
	defaultOpen = false,
	children,
}: {
	summary: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	return (
		<details className="vp-disclosure" open={defaultOpen || undefined}>
			<summary>{summary}</summary>
			<div className="vp-disclosure-body">{children}</div>
		</details>
	);
}
