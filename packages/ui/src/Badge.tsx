import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad";

export function Badge({
	tone = "neutral",
	children,
}: {
	tone?: Tone;
	children: ReactNode;
}) {
	return (
		<span className="vp-badge" data-tone={tone}>
			{children}
		</span>
	);
}
