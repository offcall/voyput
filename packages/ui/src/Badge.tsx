import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "accent" | "info";

export function Badge({
	tone = "neutral",
	dot = false,
	children,
}: {
	tone?: Tone;
	/** A small dot in the tone colour before the text. */
	dot?: boolean;
	children: ReactNode;
}) {
	return (
		<span className="vp-badge" data-tone={tone}>
			{dot ? <span className="vp-badge-dot" aria-hidden="true" /> : null}
			{children}
		</span>
	);
}
