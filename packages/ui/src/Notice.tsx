import type { AriaRole, ReactNode } from "react";
import type { Tone } from "./Badge";

/** An inline message on a tinted background; pass role="status" or "alert" when it reports a result. */
export function Notice({
	tone = "neutral",
	role,
	children,
}: {
	tone?: Tone;
	role?: AriaRole;
	children: ReactNode;
}) {
	return (
		<p className="vp-notice" data-tone={tone} role={role}>
			{children}
		</p>
	);
}
